import { MemberStatus, RoomRole, RoomStatus } from "@prisma/client";
import { NextRequest } from "next/server";
import { ApiError, jsonError, jsonOk } from "@/lib/api";
import { applyUserCookie, getOrCreateUser } from "@/lib/identity";
import { prisma } from "@/lib/prisma";
import { cleanupStaleRooms } from "@/lib/room-service";

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

    const me = await prisma.roomMember.findUnique({
      where: {
        roomId_userId: {
          roomId: room.id,
          userId: user.id,
        },
      },
    });

    if (!me || me.status !== MemberStatus.ACTIVE || me.role !== RoomRole.OWNER) {
      throw new ApiError(403, "仅房主可查看审批列表", "FORBIDDEN_REVIEW");
    }

    const requests = await prisma.joinRequest.findMany({
      where: {
        roomId: room.id,
        status: "PENDING",
      },
      include: {
        user: {
          select: {
            id: true,
            nickname: true,
            avatarInitial: true,
            avatarColor: true,
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    const response = jsonOk({
      pendingRequests: requests.map((item) => ({
        id: item.id,
        userId: item.userId,
        reason: item.reason,
        createdAt: item.createdAt.toISOString(),
        user: item.user,
      })),
    });

    return applyUserCookie(response, cookieToSet);
  } catch (error) {
    return jsonError(error);
  }
}
