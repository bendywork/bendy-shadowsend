import { AttachmentStorage, RoomStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { ApiError, jsonError } from "@/lib/api";
import { fetchDufsFile } from "@/lib/dufs";
import { applyUserCookie, getOrCreateUser } from "@/lib/identity";
import { prisma } from "@/lib/prisma";
import { createInlineReadUrl } from "@/lib/s3";
import { assertRoomMember, cleanupStaleRooms } from "@/lib/room-service";

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
        announcementImageStorage: true,
      },
    });

    if (!announcement?.announcementImageKey || !announcement.announcementImageStorage) {
      throw new ApiError(404, "公告图片不存在", "ANNOUNCEMENT_IMAGE_NOT_FOUND");
    }

    if (announcement.announcementImageStorage === AttachmentStorage.DUFS) {
      const upstream = await fetchDufsFile(announcement.announcementImageKey);
      const response = new NextResponse(upstream.body, {
        status: 200,
        headers: {
          "Content-Type": upstream.headers.get("content-type") || "application/octet-stream",
          "Cache-Control": "private, max-age=60",
        },
      });

      return applyUserCookie(response, cookieToSet);
    }

    const previewUrl = await createInlineReadUrl({
      key: announcement.announcementImageKey,
      expiresInSeconds: 120,
    });

    const response = NextResponse.redirect(previewUrl, 307);
    return applyUserCookie(response, cookieToSet);
  } catch (error) {
    return jsonError(error);
  }
}