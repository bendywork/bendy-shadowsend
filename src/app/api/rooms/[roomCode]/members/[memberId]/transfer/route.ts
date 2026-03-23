import { MemberStatus, RoomRole, RoomStatus } from "@prisma/client";
import { NextRequest } from "next/server";
import { ApiError, jsonError, jsonOk } from "@/lib/api";
import { applyUserCookie, getOrCreateUser } from "@/lib/identity";
import { prisma } from "@/lib/prisma";
import { cleanupStaleRooms } from "@/lib/room-service";

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
      select: {
        id: true,
        role: true,
        status: true,
      },
    });

    if (!currentMember || currentMember.status !== MemberStatus.ACTIVE) {
      throw new ApiError(403, "你不是房间成员", "NOT_ROOM_MEMBER");
    }

    if (currentMember.role !== RoomRole.OWNER) {
      throw new ApiError(403, "仅房主可转让房间", "FORBIDDEN_TRANSFER_OWNER");
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

    if (targetMember.status !== MemberStatus.ACTIVE) {
      throw new ApiError(400, "目标成员当前非活跃状态", "MEMBER_NOT_ACTIVE");
    }

    if (targetMember.role === RoomRole.OWNER) {
      throw new ApiError(400, "目标成员已经是房主", "TARGET_ALREADY_OWNER");
    }

    if (targetMember.userId === user.id) {
      throw new ApiError(400, "不能转让给自己", "TRANSFER_TO_SELF");
    }

    const now = new Date();

    await prisma.$transaction([
      prisma.room.update({
        where: { id: room.id },
        data: {
          ownerId: targetMember.userId,
          lastActiveAt: now,
        },
      }),
      prisma.roomMember.update({
        where: { id: currentMember.id },
        data: {
          role: RoomRole.MEMBER,
          lastSeenAt: now,
        },
      }),
      prisma.roomMember.update({
        where: { id: targetMember.id },
        data: {
          role: RoomRole.OWNER,
          lastSeenAt: now,
        },
      }),
    ]);

    const response = jsonOk({
      success: true,
      ownerId: targetMember.userId,
    });

    return applyUserCookie(response, cookieToSet);
  } catch (error) {
    return jsonError(error);
  }
}
