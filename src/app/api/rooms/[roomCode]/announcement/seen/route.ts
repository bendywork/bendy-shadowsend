import { MemberStatus, RoomStatus } from "@prisma/client";
import { NextRequest } from "next/server";
import { ApiError, jsonError, jsonOk } from "@/lib/api";
import { applyUserCookie, getOrCreateUser } from "@/lib/identity";
import { prisma } from "@/lib/prisma";
import { cleanupStaleRooms } from "@/lib/room-service";

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
    const { user, cookieToSet } = await getOrCreateUser(request);

    const room = await prisma.room.findUnique({
      where: { roomCode },
      select: { id: true, status: true },
    });

    if (!room || room.status !== RoomStatus.ACTIVE) {
      throw new ApiError(404, "房间不存在或已销毁", "ROOM_NOT_FOUND");
    }

    const member = await prisma.roomMember.findUnique({
      where: {
        roomId_userId: {
          roomId: room.id,
          userId: user.id,
        },
      },
    });

    if (!member || member.status !== MemberStatus.ACTIVE) {
      throw new ApiError(403, "你不是房间成员", "NOT_ROOM_MEMBER");
    }

    await prisma.roomMember.update({
      where: { id: member.id },
      data: {
        announcementSeenAt: new Date(),
      },
    });

    const response = jsonOk({ success: true });
    return applyUserCookie(response, cookieToSet);
  } catch (error) {
    return jsonError(error);
  }
}
