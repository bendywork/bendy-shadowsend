import { MemberStatus, RoomRole, RoomStatus } from "@prisma/client";
import { NextRequest } from "next/server";
import { APP_NAME, APP_OPEN_SOURCE } from "@/lib/constants";
import { env } from "@/lib/env";
import { jsonError, jsonOk } from "@/lib/api";
import { applyUserCookie, getOrCreateUser } from "@/lib/identity";
import { prisma } from "@/lib/prisma";
import { cleanupStaleRooms } from "@/lib/room-service";

export async function GET(request: NextRequest) {
  try {
    await cleanupStaleRooms();

    const { user, cookieToSet } = await getOrCreateUser(request);

    const [memberships, totalOnline] = await Promise.all([
      prisma.roomMember.findMany({
        where: {
          userId: user.id,
          status: MemberStatus.ACTIVE,
          room: {
            status: RoomStatus.ACTIVE,
          },
        },
        include: {
          room: true,
        },
        orderBy: {
          room: {
            createdAt: "desc",
          },
        },
      }),
      prisma.presence.count({
        where: {
          lastSeenAt: { gte: new Date(Date.now() - 2 * 60_000) },
        },
      }),
    ]);

    const createdRooms = memberships
      .filter((item) => item.role === RoomRole.OWNER)
      .map((item) => ({
        id: item.room.id,
        roomCode: item.room.roomCode,
        name: item.room.name,
        ownerId: item.room.ownerId,
        hasGateCode: Boolean(item.room.gateCode),
        gateCodeExpiresAt: item.room.gateCodeExpiresAt?.toISOString() ?? null,
        createdAt: item.room.createdAt.toISOString(),
        role: item.role,
      }));

    const joinedRooms = memberships
      .filter((item) => item.role === RoomRole.MEMBER)
      .map((item) => ({
        id: item.room.id,
        roomCode: item.room.roomCode,
        name: item.room.name,
        ownerId: item.room.ownerId,
        hasGateCode: Boolean(item.room.gateCode),
        gateCodeExpiresAt: item.room.gateCodeExpiresAt?.toISOString() ?? null,
        createdAt: item.room.createdAt.toISOString(),
        role: item.role,
      }));

    const response = jsonOk({
      app: {
        name: APP_NAME,
        version: env.appVersion,
        openSource: APP_OPEN_SOURCE,
      },
      me: {
        id: user.id,
        nickname: user.nickname,
        avatarInitial: user.avatarInitial,
        avatarColor: user.avatarColor,
      },
      tree: {
        createdRooms,
        joinedRooms,
      },
      stats: {
        totalOnline,
      },
    });

    return applyUserCookie(response, cookieToSet);
  } catch (error) {
    return jsonError(error);
  }
}

