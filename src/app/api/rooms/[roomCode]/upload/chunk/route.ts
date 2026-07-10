import { AttachmentStorage, RoomStatus } from "@prisma/client";
import { NextRequest } from "next/server";
import { customAlphabet } from "nanoid";
import { ApiError, jsonError, jsonOk } from "@/lib/api";
import { DUFS_CHUNK_SIZE_BYTES } from "@/lib/constants";
import {
  appendToDufsFile,
  createDufsImagePath,
  createDufsPublicUrl,
  deleteDufsFile,
  isDufsConfigured,
  uploadImageToDufs,
} from "@/lib/dufs";
import { applyUserCookie, getOrCreateUser } from "@/lib/identity";
import { prisma } from "@/lib/prisma";
import { assertRoomMember, cleanupStaleRooms } from "@/lib/room-service";

const keyId = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 8);

type Params = {
  roomCode: string;
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    await cleanupStaleRooms();

    if (!isDufsConfigured()) {
      throw new ApiError(503, "DUFS not configured", "DUFS_NOT_CONFIGURED");
    }

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
      throw new ApiError(400, "Missing chunk file", "CHUNK_FILE_MISSING");
    }

    const chunkIndexRaw = formData.get("chunkIndex");
    const totalChunksRaw = formData.get("totalChunks");
    const totalBytesRaw = formData.get("totalBytes");
    const fileNameRaw = formData.get("fileName");
    const mimeTypeRaw = formData.get("mimeType");
    const dufsPathRaw = formData.get("dufsPath");

    if (
      chunkIndexRaw === null ||
      totalChunksRaw === null ||
      totalBytesRaw === null ||
      typeof fileNameRaw !== "string" ||
      typeof mimeTypeRaw !== "string"
    ) {
      throw new ApiError(400, "Missing required chunk fields", "CHUNK_FIELDS_MISSING");
    }

    const chunkIndex = Number(chunkIndexRaw);
    const totalChunks = Number(totalChunksRaw);
    const totalBytes = Number(totalBytesRaw);
    const fileName = String(fileNameRaw);
    const mimeType = String(mimeTypeRaw);

    if (
      !Number.isFinite(chunkIndex) ||
      chunkIndex < 0 ||
      !Number.isFinite(totalChunks) ||
      totalChunks < 1 ||
      chunkIndex >= totalChunks ||
      !Number.isFinite(totalBytes) ||
      totalBytes <= 0
    ) {
      throw new ApiError(400, "Invalid chunk parameters", "CHUNK_INVALID_PARAMS");
    }

    if (!mimeType.startsWith("image/")) {
      throw new ApiError(400, "Chunked upload only supports images", "CHUNK_NOT_IMAGE");
    }

    if (uploaded.size > DUFS_CHUNK_SIZE_BYTES + 512 * 1024) {
      throw new ApiError(400, "Chunk exceeds maximum allowed size", "CHUNK_TOO_LARGE");
    }

    const content = new Uint8Array(await uploaded.arrayBuffer());
    const isLastChunk = chunkIndex === totalChunks - 1;
    const dufsPath =
      chunkIndex === 0
        ? createDufsImagePath({
            roomId: room.id,
            suffix: keyId(),
            fileName,
          })
        : typeof dufsPathRaw === "string" && dufsPathRaw.length > 0
          ? dufsPathRaw
          : null;

    if (!dufsPath) {
      throw new ApiError(400, "Missing dufsPath for non-zero chunk", "CHUNK_DUFS_PATH_MISSING");
    }

    if (chunkIndex === 0) {
      await uploadImageToDufs({
        path: dufsPath,
        body: content,
        contentType: mimeType,
      });
    } else {
      await appendToDufsFile({
        path: dufsPath,
        body: content,
      });
    }

    const responsePayload: Record<string, unknown> = { dufsPath };

    if (isLastChunk) {
      responsePayload.s3Key = dufsPath;
      responsePayload.fileName = fileName;
      responsePayload.mimeType = mimeType;
      responsePayload.sizeBytes = totalBytes;
      responsePayload.storage = AttachmentStorage.DUFS;
      responsePayload.previewUrl = createDufsPublicUrl(dufsPath);
    }

    const response = jsonOk(responsePayload);
    return applyUserCookie(response, cookieToSet);
  } catch (error) {
    console.error("[route] /api/rooms/[roomCode]/upload/chunk POST failed", {
      path: request.nextUrl.pathname,
      method: request.method,
      error,
    });
    return jsonError(error);
  }
}

export async function DELETE(
  request: NextRequest,
) {
  try {
    const { dufsPath } = await request.json().catch(() => ({}));

    if (!dufsPath || typeof dufsPath !== "string") {
      throw new ApiError(400, "Missing dufsPath", "CHUNK_DELETE_DUFS_PATH_MISSING");
    }

    await deleteDufsFile(dufsPath);

    return jsonOk({ deleted: true });
  } catch (error) {
    console.error("[route] /api/rooms/[roomCode]/upload/chunk DELETE failed", {
      path: request.nextUrl.pathname,
      method: request.method,
      error,
    });
    return jsonError(error);
  }
}
