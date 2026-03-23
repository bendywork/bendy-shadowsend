import { AttachmentStorage, RoomStatus } from "@prisma/client";
import { NextRequest } from "next/server";
import { customAlphabet } from "nanoid";
import { ApiError, jsonError, jsonOk } from "@/lib/api";
import { MAX_PROXY_UPLOAD_BYTES } from "@/lib/constants";
import { isDufsConfigured, uploadImageToDufs } from "@/lib/dufs";
import { applyUserCookie, getOrCreateUser } from "@/lib/identity";
import { prisma } from "@/lib/prisma";
import { assertRoomMember, cleanupStaleRooms } from "@/lib/room-service";
import { createAttachmentPreviewUrl, uploadObject } from "@/lib/s3";

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

    if (uploaded.size > proxyUploadLimitBytes) {
      throw new ApiError(
        413,
        `Proxy upload supports files up to ${Math.floor(proxyUploadLimitBytes / 1024 / 1024)}MB`,
        "FILE_TOO_LARGE",
      );
    }

    const fileName = sanitizeFileName(uploaded.name || `upload-${Date.now()}`);
    const mimeType = uploaded.type?.trim() || "application/octet-stream";
    const suffix = keyId();
    const content = new Uint8Array(await uploaded.arrayBuffer());
    const isImage = mimeType.startsWith("image/");

    let key = "";
    let previewUrl: string | null = null;
    let storage: AttachmentStorage = AttachmentStorage.S3;

    if (isImage) {
      if (!isDufsConfigured()) {
        throw new ApiError(503, "图片上传依赖 DUFS，当前未配置", "DUFS_NOT_CONFIGURED");
      }

      key = `img-${room.id}-${Date.now()}-${suffix}-${fileName}`;
      const uploadedToDufs = await uploadImageToDufs({
        path: key,
        body: content,
        contentType: mimeType,
      });
      storage = AttachmentStorage.DUFS;
      previewUrl = uploadedToDufs.publicUrl;
    } else {
      key = `rooms/${room.id}/${Date.now()}-${suffix}-${fileName}`;
      await uploadObject({
        key,
        contentType: mimeType,
        body: content,
      });

      const shouldPreparePreview = isImage || mimeType.startsWith("video/");
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
