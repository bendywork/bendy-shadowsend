import { MemberStatus, RoomRole, RoomStatus } from "@prisma/client";
import { NextRequest } from "next/server";
import { ApiError, jsonError, jsonOk } from "@/lib/api";
import { applyUserCookie, getOrCreateUser } from "@/lib/identity";
import { prisma } from "@/lib/prisma";
import { cleanupStaleRooms, touchRoom } from "@/lib/room-service";

type Params = {
  roomCode: string;
  memberId: string;
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    await cleanupStaleRooms();

    const { roomCode, memberId } = await params;
    const { user, cookieToSet } = await getOrCreateUser(request);

    const room = await prisma.room.findUnique({
      where: { roomCode },
      select: { id: true, status: true },
    });

    if (!room || room.status !== RoomStatus.ACTIVE) {
      throw new ApiError(404, "房间不存在或已销毁", "ROOM_NOT_FOUND");
    }

    const currentMember = await prisma.roomMember.findUnique({
      where: {
        roomId_userId: {
          roomId: room.id,
          userId: user.id,
        },
      },
    });

    if (!currentMember || currentMember.status !== MemberStatus.ACTIVE) {
      throw new ApiError(403, "你不是房间成员", "NOT_ROOM_MEMBER");
    }

    if (currentMember.role !== RoomRole.OWNER) {
      throw new ApiError(403, "仅房主可踢出成员", "FORBIDDEN_KICK");
    }

    const targetMember = await prisma.roomMember.findFirst({
      where: {
        id: memberId,
        roomId: room.id,
      },
      select: {
        id: true,
        userId: true,
        role: true,
        status: true,
      },
    });

    if (!targetMember) {
      throw new ApiError(404, "目标成员不存在", "MEMBER_NOT_FOUND");
    }

    if (targetMember.role === RoomRole.OWNER) {
      throw new ApiError(400, "房主不能被踢出", "OWNER_CANNOT_KICK");
    }

    if (targetMember.status !== MemberStatus.ACTIVE) {
      throw new ApiError(400, "目标成员当前非活跃状态", "MEMBER_NOT_ACTIVE");
    }

    const now = new Date();

    await prisma.$transaction([
      prisma.roomMember.update({
        where: { id: targetMember.id },
        data: {
          status: MemberStatus.KICKED,
          requiresApproval: true,
          kickedAt: now,
        },
      }),
      prisma.presence.updateMany({
        where: {
          userId: targetMember.userId,
          roomId: room.id,
        },
        data: {
          roomId: null,
        },
      }),
    ]);

    await touchRoom(room.id);

    const response = jsonOk({ success: true });
    return applyUserCookie(response, cookieToSet);
  } catch (error) {
    return jsonError(error);
  }
}
