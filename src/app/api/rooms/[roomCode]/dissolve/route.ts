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

    const me = await prisma.roomMember.findUnique({
      where: {
        roomId_userId: {
          roomId: room.id,
          userId: user.id,
        },
      },
    });

    if (!me || me.status !== MemberStatus.ACTIVE || me.role !== RoomRole.OWNER) {
      throw new ApiError(403, "仅房主可解散房间", "FORBIDDEN_DISSOLVE");
    }

    const now = new Date();

    await prisma.$transaction([
      prisma.room.update({
        where: { id: room.id },
        data: {
          status: RoomStatus.DELETED,
          deletedAt: now,
          lastActiveAt: now,
        },
      }),
      prisma.roomMember.updateMany({
        where: {
          roomId: room.id,
          status: {
            in: [MemberStatus.ACTIVE, MemberStatus.PENDING],
          },
        },
        data: {
          status: MemberStatus.LEFT,
        },
      }),
      prisma.presence.updateMany({
        where: {
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
