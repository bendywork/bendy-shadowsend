import { InviteStatus, MemberStatus, RoomRole, RoomStatus } from "@prisma/client";
import { NextRequest } from "next/server";
import { ApiError, jsonError, jsonOk } from "@/lib/api";
import { applyUserCookie, getOrCreateUser } from "@/lib/identity";
import { prisma } from "@/lib/prisma";
import { assertRoomCapacity, assertUserRoomQuota, cleanupStaleRooms } from "@/lib/room-service";
import { parseJsonBody } from "@/lib/route";
import { joinRoomSchema } from "@/lib/validators";

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
    const payload = await parseJsonBody(request, joinRoomSchema);

    const room = await prisma.room.findUnique({ where: { roomCode } });

    if (!room || room.status !== RoomStatus.ACTIVE) {
      throw new ApiError(404, "房间不存在或已销毁", "ROOM_NOT_FOUND");
    }

    const now = new Date();

    const existingMembership = await prisma.roomMember.findUnique({
      where: {
        roomId_userId: {
          roomId: room.id,
          userId: user.id,
        },
      },
    });

    if (existingMembership?.status === MemberStatus.ACTIVE) {
      await prisma.presence.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          roomId: room.id,
          lastSeenAt: now,
        },
        update: {
          roomId: room.id,
          lastSeenAt: now,
        },
      });

      await prisma.room.update({
        where: { id: room.id },
        data: { lastActiveAt: now },
      });

      const response = jsonOk({
        joined: true,
        alreadyInRoom: true,
        roomCode: room.roomCode,
      });
      return applyUserCookie(response, cookieToSet);
    }

    await assertUserRoomQuota(user.id);

    if (existingMembership?.status === MemberStatus.PENDING) {
      const response = jsonOk({
        joined: false,
        waitingApproval: true,
      });
      return applyUserCookie(response, cookieToSet);
    }

    if (existingMembership?.status === MemberStatus.KICKED || existingMembership?.requiresApproval) {
      const pendingRequest = await prisma.joinRequest.findFirst({
        where: {
          roomId: room.id,
          userId: user.id,
          status: "PENDING",
        },
      });

      if (!pendingRequest) {
        await prisma.joinRequest.create({
          data: {
            roomId: room.id,
            userId: user.id,
            memberId: existingMembership.id,
            status: "PENDING",
            reason: "被踢成员再次加入，等待房主审批",
          },
        });
      }

      await prisma.roomMember.update({
        where: { id: existingMembership.id },
        data: {
          status: MemberStatus.PENDING,
          requiresApproval: true,
          updatedAt: now,
        },
      });

      const response = jsonOk({
        joined: false,
        waitingApproval: true,
        message: "你曾被踢出房间，再次加入需要房主审批",
      });
      return applyUserCookie(response, cookieToSet);
    }

    await assertRoomCapacity(room.id);

    let inviteToUse: { id: string } | null = null;

    if (payload.inviteToken) {
      inviteToUse = await prisma.roomInvite.findFirst({
        where: {
          roomId: room.id,
          token: payload.inviteToken,
          status: InviteStatus.ACTIVE,
          expiresAt: { gt: now },
        },
        select: { id: true },
      });
    }

    const canBypassGateCode = Boolean(inviteToUse);

    if (room.gateCode && !canBypassGateCode) {
      if (!payload.gateCode || payload.gateCode !== room.gateCode) {
        throw new ApiError(400, "门禁码错误", "GATE_CODE_INVALID");
      }
    }

    await prisma.$transaction(async (tx) => {
      if (existingMembership) {
        await tx.roomMember.update({
          where: { id: existingMembership.id },
          data: {
            status: MemberStatus.ACTIVE,
            role: existingMembership.role === RoomRole.OWNER ? RoomRole.OWNER : RoomRole.MEMBER,
            requiresApproval: false,
            joinedAt: now,
            kickedAt: null,
            lastSeenAt: now,
            announcementSeenAt: room.announcementUpdatedAt ? null : now,
          },
        });
      } else {
        await tx.roomMember.create({
          data: {
            roomId: room.id,
            userId: user.id,
            role: RoomRole.MEMBER,
            status: MemberStatus.ACTIVE,
            requiresApproval: false,
            joinedAt: now,
            lastSeenAt: now,
            announcementSeenAt: room.announcementUpdatedAt ? null : now,
          },
        });
      }

      if (inviteToUse) {
        await tx.roomInvite.update({
          where: { id: inviteToUse.id },
          data: {
            status: InviteStatus.USED,
            usedAt: now,
            usedById: user.id,
          },
        });
      }

      await tx.presence.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          roomId: room.id,
          lastSeenAt: now,
        },
        update: {
          roomId: room.id,
          lastSeenAt: now,
        },
      });

      await tx.room.update({
        where: { id: room.id },
        data: { lastActiveAt: now },
      });
    });

    const response = jsonOk({
      joined: true,
      waitingApproval: false,
      roomCode: room.roomCode,
    });

    return applyUserCookie(response, cookieToSet);
  } catch (error) {
    return jsonError(error);
  }
}
