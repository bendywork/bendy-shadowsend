import { MemberStatus, RoomRole, RoomStatus } from "@prisma/client";
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

    const membership = await prisma.roomMember.findUnique({
      where: {
        roomId_userId: {
          roomId: room.id,
          userId: user.id,
        },
      },
      select: { id: true, role: true, status: true },
    });

    if (!membership || membership.status !== MemberStatus.ACTIVE) {
      throw new ApiError(403, "你不是当前房间成员", "NOT_ROOM_MEMBER");
    }

    if (membership.role === RoomRole.OWNER) {
      throw new ApiError(400, "房主不可直接退出房间", "OWNER_CANNOT_LEAVE");
    }

    await prisma.$transaction([
      prisma.roomMember.update({
        where: { id: membership.id },
        data: {
          status: MemberStatus.LEFT,
          joinedAt: null,
        },
      }),
      prisma.presence.updateMany({
        where: {
          userId: user.id,
          roomId: room.id,
        },
        data: {
          roomId: null,
        },
      }),
    ]);

    const response = jsonOk({ success: true });
    return applyUserCookie(response, cookieToSet);
  } catch (error) {
    return jsonError(error);
  }
}
