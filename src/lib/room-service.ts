import {
  InviteStatus,
  MemberStatus,
  PreviewType,
  RoomRole,
  RoomStatus,
  type Prisma,
} from "@prisma/client";
import { customAlphabet } from "nanoid";
import { ApiError } from "@/lib/api";
import {
  GATE_CODE_RECYCLE_WINDOW_MS,
  MAX_ROOM_MEMBERS,
  MAX_USER_ROOMS,
  ONLINE_WINDOW_MS,
  ROOM_IDLE_DESTROY_MS,
} from "@/lib/constants";
import { prisma } from "@/lib/prisma";

const roomCodeAlphabet = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 10);

export function createRoomCode() {
  return roomCodeAlphabet();
}

export async function cleanupStaleRooms() {
  const now = new Date();
  const idleCutoff = new Date(now.getTime() - ROOM_IDLE_DESTROY_MS);

  const staleRooms = await prisma.room.findMany({
    where: {
      status: RoomStatus.ACTIVE,
      neverExpire: false,
      lastActiveAt: { lt: idleCutoff },
    },
    select: { id: true },
  });

  if (staleRooms.length > 0) {
    const roomIds = staleRooms.map((room) => room.id);

    await prisma.$transaction([
      prisma.room.updateMany({
        where: { id: { in: roomIds } },
        data: {
          status: RoomStatus.DELETED,
          deletedAt: now,
        },
      }),
      prisma.roomMember.updateMany({
        where: {
          roomId: { in: roomIds },
          status: { in: [MemberStatus.ACTIVE, MemberStatus.PENDING] },
        },
        data: { status: MemberStatus.LEFT },
      }),
      prisma.presence.updateMany({
        where: { roomId: { in: roomIds } },
        data: { roomId: null },
      }),
    ]);
  }

  await prisma.roomInvite.updateMany({
    where: {
      status: InviteStatus.ACTIVE,
      expiresAt: { lt: now },
    },
    data: { status: InviteStatus.EXPIRED },
  });

  return staleRooms.length;
}

export async function countUserActiveRooms(userId: string) {
  return prisma.roomMember.count({
    where: {
      userId,
      status: MemberStatus.ACTIVE,
      room: { status: RoomStatus.ACTIVE },
    },
  });
}

export async function assertUserRoomQuota(userId: string) {
  const count = await countUserActiveRooms(userId);
  if (count >= MAX_USER_ROOMS) {
    throw new ApiError(400, `每个用户最多加入或创建 ${MAX_USER_ROOMS} 个房间`, "ROOM_LIMIT_REACHED");
  }
}

export async function countRoomActiveMembers(roomId: string) {
  return prisma.roomMember.count({
    where: {
      roomId,
      status: MemberStatus.ACTIVE,
    },
  });
}

export async function assertRoomCapacity(roomId: string) {
  const memberCount = await countRoomActiveMembers(roomId);
  if (memberCount >= MAX_ROOM_MEMBERS) {
    throw new ApiError(400, `每个房间最多 ${MAX_ROOM_MEMBERS} 人`, "ROOM_CAPACITY_REACHED");
  }
}

export async function touchRoom(roomId: string) {
  await prisma.room.update({
    where: { id: roomId },
    data: { lastActiveAt: new Date() },
  });
}

export async function findActiveRoomByCode(roomCode: string) {
  return prisma.room.findUnique({
    where: { roomCode },
    include: {
      owner: {
        select: {
          id: true,
          nickname: true,
          avatarInitial: true,
          avatarColor: true,
        },
      },
    },
  });
}

export function assertRoomActive(room: { status: RoomStatus } | null) {
  if (!room || room.status !== RoomStatus.ACTIVE) {
    throw new ApiError(404, "房间不存在或已销毁", "ROOM_NOT_FOUND");
  }
}

export async function assertGateCodeUniqueWithinWindow(
  gateCode: string,
  options?: { excludeRoomId?: string },
) {
  const since = new Date(Date.now() - GATE_CODE_RECYCLE_WINDOW_MS);
  const conflict = await prisma.room.findFirst({
    where: {
      status: RoomStatus.ACTIVE,
      gateCode,
      createdAt: { gte: since },
      ...(options?.excludeRoomId
        ? {
            id: {
              not: options.excludeRoomId,
            },
          }
        : {}),
    },
    select: { id: true },
  });

  if (conflict) {
    throw new ApiError(
      400,
      "该门禁码在最近 1 分钟内已被使用，请更换门禁码",
      "GATE_CODE_RECENTLY_USED",
    );
  }
}

export function resolvePreviewType(mimeType: string) {
  if (mimeType.startsWith("image/")) {
    return PreviewType.IMAGE;
  }
  if (mimeType.startsWith("video/")) {
    return PreviewType.VIDEO;
  }
  return PreviewType.NONE;
}

export async function getRoomMembership(roomId: string, userId: string) {
  return prisma.roomMember.findUnique({
    where: {
      roomId_userId: {
        roomId,
        userId,
      },
    },
  });
}

export async function assertRoomMember(roomId: string, userId: string) {
  const membership = await getRoomMembership(roomId, userId);

  if (!membership || membership.status !== MemberStatus.ACTIVE) {
    throw new ApiError(403, "你不是当前房间成员", "NOT_ROOM_MEMBER");
  }

  return membership;
}

export async function getOnlineStats(roomId: string) {
  const activeSince = new Date(Date.now() - ONLINE_WINDOW_MS);

  const [roomOnline, totalOnline] = await Promise.all([
    prisma.presence.count({
      where: {
        roomId,
        lastSeenAt: { gte: activeSince },
      },
    }),
    prisma.presence.count({
      where: {
        lastSeenAt: { gte: activeSince },
      },
    }),
  ]);

  return {
    roomOnline,
    totalOnline,
  };
}

export type RoomSummary = {
  id: string;
  roomCode: string;
  name: string;
  ownerId: string;
  hasGateCode: boolean;
  gateCodeExpiresAt: string | null;
  createdAt: string;
  role: RoomRole;
};

export function mapRoomSummary(room: {
  id: string;
  roomCode: string;
  name: string;
  ownerId: string;
  gateCode: string | null;
  gateCodeExpiresAt: Date | null;
  createdAt: Date;
  role: RoomRole;
}): RoomSummary {
  return {
    id: room.id,
    roomCode: room.roomCode,
    name: room.name,
    ownerId: room.ownerId,
    hasGateCode: Boolean(room.gateCode),
    gateCodeExpiresAt: room.gateCodeExpiresAt?.toISOString() ?? null,
    createdAt: room.createdAt.toISOString(),
    role: room.role,
  };
}

export type MessageWithRelations = Prisma.MessageGetPayload<{
  include: {
    sender: {
      select: {
        id: true;
        nickname: true;
        avatarInitial: true;
        avatarColor: true;
      };
    };
    attachments: true;
  };
}>;

