import { RoomStatus } from "@prisma/client";
import type { NextRequest } from "next/server";

import { ApiError } from "@/lib/api";
import { getOrCreateUser } from "@/lib/identity";
import { prisma } from "@/lib/prisma";
import { assertRoomMember, cleanupStaleRooms } from "@/lib/room-service";

export type AccessibleAttachment = {
  id: string;
  roomId: string;
  uploaderId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: bigint;
  s3Key: string;
  storage: string;
  chunkManifest: unknown;
};

export type AttachmentAccess = {
  roomId: string;
  userId: string;
  cookieToSet?: string;
  attachment: AccessibleAttachment;
};

export async function loadAttachmentAccess(
  request: NextRequest,
  roomCode: string,
  attachmentId: string,
): Promise<AttachmentAccess> {
  await cleanupStaleRooms();

  const { user, cookieToSet } = await getOrCreateUser(request);
  const room = await prisma.room.findUnique({
    where: { roomCode },
    select: { id: true, status: true },
  });

  if (!room || room.status !== RoomStatus.ACTIVE) {
    throw new ApiError(404, "房间不存在或已销毁", "ROOM_NOT_FOUND");
  }

  await assertRoomMember(room.id, user.id);

  const attachment = await prisma.messageAttachment.findFirst({
    where: { id: attachmentId, roomId: room.id },
    select: {
      id: true,
      roomId: true,
      uploaderId: true,
      fileName: true,
      mimeType: true,
      sizeBytes: true,
      s3Key: true,
      storage: true,
      chunkManifest: true,
    },
  });

  if (!attachment) {
    throw new ApiError(404, "文件不存在", "ATTACHMENT_NOT_FOUND");
  }

  return { roomId: room.id, userId: user.id, cookieToSet, attachment };
}
