import { RoomStatus } from "@prisma/client";
import { NextRequest } from "next/server";
import { customAlphabet } from "nanoid";
import { ApiError, jsonError, jsonOk } from "@/lib/api";
import { applyUserCookie, getOrCreateUser } from "@/lib/identity";
import { prisma } from "@/lib/prisma";
import { parseJsonBody } from "@/lib/route";
import { createUploadUrl } from "@/lib/s3";
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

    const suffix = keyId();
    const key = `rooms/${room.id}/${Date.now()}-${suffix}-${sanitizeFileName(payload.fileName)}`;

    const uploadUrl = await createUploadUrl({
      key,
      contentType: payload.mimeType,
      expiresInSeconds: 120,
    });

    const response = jsonOk({
      uploadUrl,
      s3Key: key,
      method: "PUT",
      headers: {
        "Content-Type": payload.mimeType,
      },
    });

    return applyUserCookie(response, cookieToSet);
  } catch (error) {
    return jsonError(error);
  }
}
