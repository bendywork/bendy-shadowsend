import { AttachmentStorage, RoomStatus } from "@prisma/client";
import { NextRequest } from "next/server";
import { ApiError, jsonError, jsonOk } from "@/lib/api";
import { applyUserCookie, getOrCreateUser } from "@/lib/identity";
import { prisma } from "@/lib/prisma";
import { assertRoomMember, cleanupStaleRooms } from "@/lib/room-service";
import { uploadToSang } from "@/lib/sang";
import { throwLegacyStorageUploadDisabled } from "@/lib/storage-policy";
import {
  SANG_SINGLE_REQUEST_MAX_BYTES,
  isImageFile,
  resolveImageMimeType,
} from "@/lib/upload-rules";

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

    // REQ-202610-0516（up-07）：该接口只保留 file.sang.pub 图片通道。
    // 非图片的 S3/DUFS 旧写入路径已旁路，统一由 /upload/pic-sl 承接。
    if (!isImage) {
      throwLegacyStorageUploadDisabled();
    }

    const mimeType = resolveImageMimeType(fileName, rawMimeType);

    if (uploaded.size > SANG_SINGLE_REQUEST_MAX_BYTES) {
      throw new ApiError(
        413,
        `图片单次上传最大 ${Math.floor(
          SANG_SINGLE_REQUEST_MAX_BYTES / 1024 / 1024,
        )}MB，分片上传尚未接入`,
        "IMAGE_TOO_LARGE_FOR_SANG",
      );
    }

    const content = new Uint8Array(await uploaded.arrayBuffer());

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
  } catch (error) {
    console.error("[route] /api/rooms/[roomCode]/upload failed", {
      path: request.nextUrl.pathname,
      method: request.method,
      error,
    });
    return jsonError(error);
  }
}
