import {
  AttachmentStorage,
  MemberStatus,
  RoomRole,
  RoomStatus,
} from "@prisma/client";
import { NextRequest } from "next/server";
import { ApiError, jsonError, jsonOk } from "@/lib/api";
import { createDufsPublicUrl } from "@/lib/dufs";
import { applyUserCookie, getOrCreateUser } from "@/lib/identity";
import { prisma } from "@/lib/prisma";
import { parseJsonBody } from "@/lib/route";
import { createInlineReadUrl } from "@/lib/s3";
import { cleanupStaleRooms, touchRoom } from "@/lib/room-service";
import { roomAnnouncementSchema } from "@/lib/validators";

type Params = {
  roomCode: string;
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    await cleanupStaleRooms();

    const { roomCode } = await params;
    const payload = await parseJsonBody(request, roomAnnouncementSchema);
    const { user, cookieToSet } = await getOrCreateUser(request);

    const room = await prisma.room.findUnique({
      where: { roomCode },
      select: {
        id: true,
        status: true,
        announcementImageKey: true,
        announcementImageStorage: true,
      },
    });

    if (!room || room.status !== RoomStatus.ACTIVE) {
      throw new ApiError(404, "房间不存在或已销毁", "ROOM_NOT_FOUND");
    }

    const me = await prisma.roomMember.findUnique({
      where: {
        roomId_userId: {
          roomId: room.id,
          userId: user.id,
        },
      },
    });

    if (!me || me.status !== MemberStatus.ACTIVE || me.role !== RoomRole.OWNER) {
      throw new ApiError(403, "仅房主可以配置公告", "FORBIDDEN_ANNOUNCEMENT");
    }

    if (payload.image && !payload.image.mimeType.startsWith("image/")) {
      throw new ApiError(400, "公告图片必须是图片格式", "ANNOUNCEMENT_IMAGE_INVALID");
    }

    const nextImageKey = payload.clearImage
      ? null
      : payload.image?.s3Key ?? room.announcementImageKey;
    const nextImageStorage = payload.clearImage
      ? null
      : payload.image?.storage ?? room.announcementImageStorage;
    const nextImageName = payload.clearImage ? null : payload.image?.fileName ?? null;
    const nextText = payload.text ?? null;

    if (!nextText && !nextImageKey) {
      throw new ApiError(400, "公告内容与图片不能同时为空", "ANNOUNCEMENT_EMPTY");
    }

    const updated = await prisma.room.update({
      where: { id: room.id },
      data: {
        announcementText: nextText,
        announcementImageKey: nextImageKey,
        announcementImageName: nextImageName,
        announcementImageStorage: nextImageStorage,
        announcementUpdatedAt: new Date(),
      },
      select: {
        announcementText: true,
        announcementImageKey: true,
        announcementImageName: true,
        announcementImageStorage: true,
        announcementUpdatedAt: true,
      },
    });

    await touchRoom(room.id);

    const imageUrl = updated.announcementImageKey
      ? updated.announcementImageStorage === AttachmentStorage.DUFS
        ? createDufsPublicUrl(updated.announcementImageKey)
        : await createInlineReadUrl({
            key: updated.announcementImageKey,
            expiresInSeconds: 120,
          })
      : null;

    const response = jsonOk({
      announcement: {
        text: updated.announcementText,
        imageUrl,
        imageName: updated.announcementImageName,
        updatedAt: updated.announcementUpdatedAt?.toISOString() ?? null,
      },
    });

    return applyUserCookie(response, cookieToSet);
  } catch (error) {
    return jsonError(error);
  }
}
