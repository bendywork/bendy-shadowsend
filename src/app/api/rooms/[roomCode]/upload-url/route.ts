import { AttachmentStorage, RoomStatus } from "@prisma/client";
import { NextRequest } from "next/server";
import { customAlphabet } from "nanoid";
import { ApiError, jsonError, jsonOk } from "@/lib/api";
import { isS3Configured } from "@/lib/env";
import { applyUserCookie, getOrCreateUser } from "@/lib/identity";
import { prisma } from "@/lib/prisma";
import { parseJsonBody } from "@/lib/route";
import { createAttachmentPreviewUrl, createUploadUrl } from "@/lib/s3";
import { assertRoomMember, cleanupStaleRooms } from "@/lib/room-service";
import { uploadPrepareSchema } from "@/lib/validators";

const keyId = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 8);

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
    const payload = await parseJsonBody(request, uploadPrepareSchema);

    const room = await prisma.room.findUnique({
      where: { roomCode },
      select: { id: true, status: true },
    });

    if (!room || room.status !== RoomStatus.ACTIVE) {
      throw new ApiError(404, "房间不存在或已销毁", "ROOM_NOT_FOUND");
    }

    await assertRoomMember(room.id, user.id);

    if (payload.mimeType.startsWith("image/")) {
      throw new ApiError(400, "图片上传请走 DUFS 后端通道", "IMAGE_UPLOAD_USE_DUFS");
    }

    if (!isS3Configured()) {
      throw new ApiError(400, "当前未配置 S3，请走 DUFS 后端通道上传", "S3_NOT_CONFIGURED");
    }

    const suffix = keyId();
    const key = `rooms/${room.id}/${Date.now()}-${suffix}-${sanitizeFileName(payload.fileName)}`;

    const uploadUrl = await createUploadUrl({
      key,
      contentType: payload.mimeType,
      expiresInSeconds: 120,
    });

    const shouldPreparePreview = payload.mimeType.startsWith("video/");
    const previewUrl = shouldPreparePreview
      ? await createAttachmentPreviewUrl({
          key,
          fileName: payload.fileName,
          mimeType: payload.mimeType,
          sizeBytes: payload.sizeBytes,
          cookieHeader: request.headers.get("cookie") ?? undefined,
          expiresInSeconds: 120,
        })
      : null;

    const response = jsonOk({
      uploadUrl,
      previewUrl,
      s3Key: key,
      fileName: payload.fileName,
      mimeType: payload.mimeType,
      sizeBytes: payload.sizeBytes,
      storage: AttachmentStorage.S3,
      method: "PUT",
      headers: {
        "Content-Type": payload.mimeType,
      },
    });

    return applyUserCookie(response, cookieToSet);
  } catch (error) {
    console.error("[route] /api/rooms/[roomCode]/upload-url failed", {
      path: request.nextUrl.pathname,
      method: request.method,
      error,
    });
    return jsonError(error);
  }
}