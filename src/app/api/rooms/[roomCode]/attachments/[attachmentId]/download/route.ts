import { AttachmentStorage, RoomStatus } from "@prisma/client";
import { NextRequest } from "next/server";
import { ApiError, jsonError, jsonOk } from "@/lib/api";
import { createDufsPublicUrl } from "@/lib/dufs";
import { applyUserCookie, getOrCreateUser } from "@/lib/identity";
import { prisma } from "@/lib/prisma";
import { createDownloadUrl } from "@/lib/s3";
import { assertRoomMember, cleanupStaleRooms } from "@/lib/room-service";

type Params = {
  roomCode: string;
  attachmentId: string;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    await cleanupStaleRooms();

    const { roomCode, attachmentId } = await params;
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
      where: {
        id: attachmentId,
        roomId: room.id,
      },
      select: {
        id: true,
        s3Key: true,
        fileName: true,
        storage: true,
      },
    });

    if (!attachment) {
      throw new ApiError(404, "文件不存在", "ATTACHMENT_NOT_FOUND");
    }

    const downloadUrl =
      attachment.storage === AttachmentStorage.DUFS
        ? createDufsPublicUrl(attachment.s3Key)
        : await createDownloadUrl({
            key: attachment.s3Key,
            filename: attachment.fileName,
            expiresInSeconds: 90,
          });

    const response = jsonOk({
      url: downloadUrl,
    });

    return applyUserCookie(response, cookieToSet);
  } catch (error) {
    return jsonError(error);
  }
}
