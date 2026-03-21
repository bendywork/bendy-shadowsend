import { MemberStatus, RoomRole, RoomStatus } from "@prisma/client";
import { NextRequest } from "next/server";
import { ApiError, jsonError, jsonOk } from "@/lib/api";
import { applyUserCookie, getOrCreateUser } from "@/lib/identity";
import { prisma } from "@/lib/prisma";
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

    const me = await assertRoomMember(room.id, user.id);

    const [members, requests] = await Promise.all([
      prisma.roomMember.findMany({
        where: {
          roomId: room.id,
          status: MemberStatus.ACTIVE,
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
        orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
      }),
      me.role === RoomRole.OWNER
        ? prisma.joinRequest.findMany({
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
          })
        : Promise.resolve([]),
    ]);

    const response = jsonOk({
      members: members.map((member) => ({
        id: member.id,
        userId: member.userId,
        role: member.role,
        status: member.status,
        joinedAt: member.joinedAt?.toISOString() ?? null,
        user: member.user,
      })),
      pendingRequests: requests.map((requestItem) => ({
        id: requestItem.id,
        userId: requestItem.userId,
        reason: requestItem.reason,
        createdAt: requestItem.createdAt.toISOString(),
        user: requestItem.user,
      })),
    });

    return applyUserCookie(response, cookieToSet);
  } catch (error) {
    return jsonError(error);
  }
}
