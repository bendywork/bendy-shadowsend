import {
  MemberStatus,
  RoomRole,
  RoomStatus,
} from "@prisma/client";
import { NextRequest } from "next/server";
import {
  buildAnnouncementImageViews,
  parseAnnouncementImages,
  serializeAnnouncementImages,
} from "@/lib/announcement";
import { ApiError, jsonError, jsonOk } from "@/lib/api";
import { MAX_ANNOUNCEMENT_IMAGES } from "@/lib/constants";
import { applyUserCookie, getOrCreateUser } from "@/lib/identity";
import { prisma } from "@/lib/prisma";
import { parseJsonBody } from "@/lib/route";
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
        announcementImageName: true,
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

    const currentImages = parseAnnouncementImages(room);
    const keepIndexes = payload.keepImageIndexes;

    if (
      keepIndexes &&
      keepIndexes.some((index) => index < 0 || index >= currentImages.length)
    ) {
      throw new ApiError(400, "公告图片索引无效", "ANNOUNCEMENT_IMAGE_INDEX_INVALID");
    }

    const keptImages = payload.clearImage
      ? []
      : keepIndexes
        ? Array.from(new Set(keepIndexes)).map((index) => currentImages[index])
        : currentImages;

    const incomingImages = payload.newImages ?? (payload.image ? [payload.image] : []);

    if (incomingImages.some((image) => !image.mimeType.startsWith("image/"))) {
      throw new ApiError(
        400,
        "公告图片必须是 image/* 类型",
        "ANNOUNCEMENT_IMAGE_INVALID",
      );
    }

    const nextImages = [...keptImages, ...incomingImages];

    if (nextImages.length > MAX_ANNOUNCEMENT_IMAGES) {
      throw new ApiError(
        400,
        `公告最多允许 ${MAX_ANNOUNCEMENT_IMAGES} 张图片`,
        "ANNOUNCEMENT_IMAGE_LIMIT",
      );
    }

    const nextText = payload.text ?? null;

    if (!nextText && nextImages.length === 0) {
      throw new ApiError(
        400,
        "公告内容与图片不能同时为空",
        "ANNOUNCEMENT_EMPTY",
      );
    }

    const serialized = serializeAnnouncementImages(nextImages);

    const updated = await prisma.room.update({
      where: { id: room.id },
      data: {
        announcementText: nextText,
        ...serialized,
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

    const updatedImages = buildAnnouncementImageViews(
      roomCode,
      parseAnnouncementImages(updated),
    );

    const response = jsonOk({
      announcement: {
        text: updated.announcementText,
        imageUrl: updatedImages[0]?.imageUrl ?? null,
        imageName: updatedImages[0]?.imageName ?? null,
        images: updatedImages,
        updatedAt: updated.announcementUpdatedAt?.toISOString() ?? null,
      },
    });

    return applyUserCookie(response, cookieToSet);
  } catch (error) {
    return jsonError(error);
  }
}
