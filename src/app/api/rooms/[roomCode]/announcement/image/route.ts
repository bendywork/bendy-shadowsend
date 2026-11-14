import { RoomStatus } from "@prisma/client";
import { NextRequest } from "next/server";
import { parseAnnouncementImages } from "@/lib/announcement";
import { ApiError, jsonError } from "@/lib/api";
import { createRemoteAttachmentResponse } from "@/lib/attachment-response";
import { applyUserCookie, getOrCreateUser } from "@/lib/identity";
import { prisma } from "@/lib/prisma";
import { assertRoomMember, cleanupStaleRooms } from "@/lib/room-service";

export const runtime = "nodejs";
export const maxDuration = 300;

type Params = {
  roomCode: string;
};

export async function GET(
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
      throw new ApiError(404, "房间不存在或已销毁", "ROOM_NOT_FOUND");
    }

    await assertRoomMember(room.id, user.id);

    const announcement = await prisma.room.findUnique({
      where: { id: room.id },
      select: {
        announcementImageKey: true,
        announcementImageName: true,
        announcementImageStorage: true,
      },
    });

    const indexParam = request.nextUrl.searchParams.get("index");
    const index = Number(indexParam ?? "0");
    if (!Number.isInteger(index) || index < 0) throw new ApiError(400, "公告图片索引无效", "ANNOUNCEMENT_IMAGE_INDEX_INVALID");

    const images = parseAnnouncementImages({
      announcementImageKey: announcement?.announcementImageKey ?? null,
      announcementImageName: announcement?.announcementImageName ?? null,
      announcementImageStorage: announcement?.announcementImageStorage ?? null,
    });

    const image = images[index];

    if (!image) {
      throw new ApiError(404, "公告图片不存在", "ANNOUNCEMENT_IMAGE_NOT_FOUND");
    }

    const response = await createRemoteAttachmentResponse(image, {
      disposition: "inline", range: request.headers.get("range"), signal: request.signal,
    });
    return applyUserCookie(response, cookieToSet);
  } catch (error) {
    return jsonError(error);
  }
}
