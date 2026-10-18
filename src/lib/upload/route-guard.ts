import { RoomStatus } from "@prisma/client";
import type { NextRequest } from "next/server";

import { ApiError } from "@/lib/api";
import { env } from "@/lib/env";
import { getOrCreateUser } from "@/lib/identity";
import { prisma } from "@/lib/prisma";
import { assertRoomMember, cleanupStaleRooms } from "@/lib/room-service";
import { isSameOriginUpload, parseAllowedOrigins } from "@/lib/upload/origin";
import { assertUploadRateLimit } from "@/lib/upload/rate-limit";

export type UploadGuardContext = {
  userId: string;
  roomId: string;
  cookieToSet?: string;
};

export function assertUploadOrigin(request: NextRequest): void {
  const allowedOrigins = parseAllowedOrigins(env.upload.allowedOrigins);
  const allowed = isSameOriginUpload({
    origin: request.headers.get("origin"),
    referer: request.headers.get("referer"),
    host: request.headers.get("host"),
    forwardedHost: request.headers.get("x-forwarded-host"),
    secFetchSite: request.headers.get("sec-fetch-site"),
    allowedOrigins,
  });

  if (!allowed) {
    throw new ApiError(403, "上传来源校验失败", "UPLOAD_ORIGIN_REJECTED");
  }
}

export async function guardUploadRequest(
  request: NextRequest,
  roomCode: string,
): Promise<UploadGuardContext> {
  await cleanupStaleRooms();
  assertUploadOrigin(request);

  const { user, cookieToSet } = await getOrCreateUser(request);
  assertUploadRateLimit(user.id);

  const room = await prisma.room.findUnique({
    where: { roomCode },
    select: { id: true, status: true },
  });

  if (!room || room.status !== RoomStatus.ACTIVE) {
    throw new ApiError(404, "Room not found or already deleted", "ROOM_NOT_FOUND");
  }

  await assertRoomMember(room.id, user.id);

  return { userId: user.id, roomId: room.id, cookieToSet };
}
