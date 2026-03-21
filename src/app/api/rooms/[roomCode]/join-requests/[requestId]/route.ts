import { MemberStatus, RequestStatus, RoomRole, RoomStatus } from "@prisma/client";
import { NextRequest } from "next/server";
import { ApiError, jsonError, jsonOk } from "@/lib/api";
import { applyUserCookie, getOrCreateUser } from "@/lib/identity";
import { prisma } from "@/lib/prisma";
import { assertRoomCapacity, assertUserRoomQuota, cleanupStaleRooms, touchRoom } from "@/lib/room-service";
import { parseJsonBody } from "@/lib/route";
import { reviewRequestSchema } from "@/lib/validators";

type Params = {
  roomCode: string;
  requestId: string;
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    await cleanupStaleRooms();

    const { roomCode, requestId } = await params;
    const payload = await parseJsonBody(request, reviewRequestSchema);
    const { user, cookieToSet } = await getOrCreateUser(request);

    const room = await prisma.room.findUnique({
      where: { roomCode },
      select: { id: true, status: true, announcementUpdatedAt: true },
    });

    if (!room || room.status !== RoomStatus.ACTIVE) {
      throw new ApiError(404, "房间不存在或已销毁", "ROOM_NOT_FOUND");
    }

    const reviewer = await prisma.roomMember.findUnique({
      where: {
        roomId_userId: {
          roomId: room.id,
          userId: user.id,
        },
      },
    });

    if (!reviewer || reviewer.status !== MemberStatus.ACTIVE || reviewer.role !== RoomRole.OWNER) {
      throw new ApiError(403, "仅房主可以审批", "FORBIDDEN_REVIEW");
    }

    const joinRequest = await prisma.joinRequest.findFirst({
      where: {
        id: requestId,
        roomId: room.id,
      },
      include: {
        member: true,
      },
    });

    if (!joinRequest || joinRequest.status !== RequestStatus.PENDING) {
      throw new ApiError(404, "审批请求不存在或已处理", "REQUEST_NOT_FOUND");
    }

    const now = new Date();

    if (payload.action === "approve") {
      await assertRoomCapacity(room.id);
      await assertUserRoomQuota(joinRequest.userId);

      await prisma.$transaction(async (tx) => {
        if (joinRequest.member) {
          await tx.roomMember.update({
            where: { id: joinRequest.member.id },
            data: {
              status: MemberStatus.ACTIVE,
              requiresApproval: false,
              joinedAt: now,
              kickedAt: null,
              announcementSeenAt: room.announcementUpdatedAt ? null : now,
            },
          });
        } else {
          await tx.roomMember.upsert({
            where: {
              roomId_userId: {
                roomId: room.id,
                userId: joinRequest.userId,
              },
            },
            create: {
              roomId: room.id,
              userId: joinRequest.userId,
              role: RoomRole.MEMBER,
              status: MemberStatus.ACTIVE,
              requiresApproval: false,
              joinedAt: now,
              announcementSeenAt: room.announcementUpdatedAt ? null : now,
            },
            update: {
              status: MemberStatus.ACTIVE,
              requiresApproval: false,
              joinedAt: now,
              announcementSeenAt: room.announcementUpdatedAt ? null : now,
            },
          });
        }

        await tx.joinRequest.update({
          where: { id: joinRequest.id },
          data: {
            status: RequestStatus.APPROVED,
            reviewedAt: now,
            reviewedById: user.id,
          },
        });

        await tx.room.update({
          where: { id: room.id },
          data: { lastActiveAt: now },
        });
      });
    } else {
      await prisma.$transaction(async (tx) => {
        if (joinRequest.member) {
          await tx.roomMember.update({
            where: { id: joinRequest.member.id },
            data: {
              status: MemberStatus.KICKED,
              requiresApproval: true,
            },
          });
        }

        await tx.joinRequest.update({
          where: { id: joinRequest.id },
          data: {
            status: RequestStatus.REJECTED,
            reviewedAt: now,
            reviewedById: user.id,
          },
        });
      });
    }

    await touchRoom(room.id);

    const response = jsonOk({
      success: true,
      action: payload.action,
    });

    return applyUserCookie(response, cookieToSet);
  } catch (error) {
    return jsonError(error);
  }
}
