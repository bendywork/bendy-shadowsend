import { AttachmentStorage, RoomStatus } from "@prisma/client";
import { NextRequest } from "next/server";
import { customAlphabet } from "nanoid";
import { ApiError, jsonError, jsonOk } from "@/lib/api";
import { MAX_PROXY_UPLOAD_BYTES } from "@/lib/constants";
import { isS3Configured } from "@/lib/env";
import { isDufsConfigured, uploadImageToDufs } from "@/lib/dufs";
import { applyUserCookie, getOrCreateUser } from "@/lib/identity";
import { prisma } from "@/lib/prisma";
import { assertRoomMember, cleanupStaleRooms } from "@/lib/room-service";
import { createAttachmentPreviewUrl, uploadObject } from "@/lib/s3";
import { uploadToSang } from "@/lib/sang";
import {
  SANG_SINGLE_REQUEST_MAX_BYTES,
  isImageFile,
  resolveImageMimeType,
} from "@/lib/upload-rules";

const keyId = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 8);
const proxyUploadLimitBytes = MAX_PROXY_UPLOAD_BYTES;

type Params = {
  roomCode: string;
};

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[\\/:*?"<>|\u0000-\u001F]/g, "_").slice(0, 180);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    await cleanupStaleRooms();

    const { roomCode } = await params;
    const { user, cookieToSet } = await getOrCreateUser(request);

    const room = await prisma.room.findUnique({
      where: { roomCode },
      select: { id: true, status: true },
    });

    if (!room || room.status !== RoomStatus.ACTIVE) {
      throw new ApiError(404, "Room not found or already deleted", "ROOM_NOT_FOUND");
    }

    await assertRoomMember(room.id, user.id);

    const formData = await request.formData();
    const uploaded = formData.get("file");

    if (!(uploaded instanceof File)) {
      throw new ApiError(400, "Missing uploaded file", "FILE_MISSING");
    }

    if (uploaded.size <= 0) {
      throw new ApiError(400, "File size must be greater than 0", "INVALID_FILE_SIZE");
    }

    const fileName = sanitizeFileName(uploaded.name || `upload-${Date.now()}`);
    const rawMimeType = uploaded.type?.trim() || "application/octet-stream";
    const isImage = isImageFile(fileName, rawMimeType);
    const mimeType = isImage
      ? resolveImageMimeType(fileName, rawMimeType)
      : rawMimeType;

    if (isImage && uploaded.size > SANG_SINGLE_REQUEST_MAX_BYTES) {
      throw new ApiError(
        413,
        `图片单次上传最大 ${Math.floor(
          SANG_SINGLE_REQUEST_MAX_BYTES / 1024 / 1024,
        )}MB，更大的图片请使用分片上传`,
        "IMAGE_TOO_LARGE_FOR_SANG",
      );
    }

    if (uploaded.size > proxyUploadLimitBytes) {
      throw new ApiError(
        413,
        `Proxy upload supports files up to ${Math.floor(proxyUploadLimitBytes / 1024 / 1024)}MB`,
        "FILE_TOO_LARGE",
      );
    }

    const suffix = keyId();
    const content = new Uint8Array(await uploaded.arrayBuffer());

    if (isImage) {
      // REQ-202610-0510：图片主路径统一走 file.sang.pub 服务端封装。
      // dc-06：失败时仅做同服务有限重试，不跨存储回退。
      const result = await uploadToSang({
        fileName,
        mimeType,
        body: content,
        sizeBytes: uploaded.size,
      });

      const response = jsonOk({
        s3Key: result.url,
        fileName,
        mimeType,
        sizeBytes: uploaded.size,
        storage: AttachmentStorage.SANG,
        previewUrl: result.url,
      });

      return applyUserCookie(response, cookieToSet);
    }

    const dufsConfigured = isDufsConfigured();
    const s3Configured = isS3Configured();

    let key = "";
    let previewUrl: string | null = null;
    let storage: AttachmentStorage = AttachmentStorage.S3;

    if (s3Configured) {
      key = `rooms/${room.id}/${Date.now()}-${suffix}-${fileName}`;
      await uploadObject({
        key,
        contentType: mimeType,
        body: content,
      });

      const shouldPreparePreview = mimeType.startsWith("video/");
      previewUrl = shouldPreparePreview
        ? await createAttachmentPreviewUrl({
            key,
            fileName,
            mimeType,
            sizeBytes: uploaded.size,
            cookieHeader: request.headers.get("cookie") ?? undefined,
            expiresInSeconds: 120,
          })
        : null;
    } else if (dufsConfigured) {
      key = `file-${room.id}-${Date.now()}-${suffix}-${fileName}`;
      const uploadedToDufs = await uploadImageToDufs({
        path: key,
        body: content,
        contentType: mimeType,
      });
      storage = AttachmentStorage.DUFS;
      previewUrl = mimeType.startsWith("video/") ? uploadedToDufs.publicUrl : null;
    } else {
      throw new ApiError(500, "未配置可用存储（S3/DUFS）", "STORAGE_NOT_CONFIGURED");
    }

    const response = jsonOk({
      s3Key: key,
      fileName,
      mimeType,
      sizeBytes: uploaded.size,
      storage,
      previewUrl,
    });

    return applyUserCookie(response, cookieToSet);
  } catch (error) {
    console.error("[route] /api/rooms/[roomCode]/upload failed", {
      path: request.nextUrl.pathname,
      method: request.method,
      error,
    });
    return jsonError(error);
  }
}
