import { MemberStatus, RoomRole } from "@prisma/client";
import { NextRequest } from "next/server";
import { ApiError, jsonError, jsonOk } from "@/lib/api";
import { GATE_CODE_TTL_MS } from "@/lib/constants";
import { applyUserCookie, getOrCreateUser } from "@/lib/identity";
import { prisma } from "@/lib/prisma";
import {
  assertGateCodeUniqueWithinWindow,
  assertUserRoomQuota,
  cleanupStaleRooms,
  createRoomCode,
} from "@/lib/room-service";
import { parseJsonBody } from "@/lib/route";
import { createRoomSchema } from "@/lib/validators";

export async function POST(request: NextRequest) {
  try {
    await cleanupStaleRooms();

    const { user, cookieToSet } = await getOrCreateUser(request);
    const payload = await parseJsonBody(request, createRoomSchema);

    await assertUserRoomQuota(user.id);

    if (payload.gateCode) {
      await assertGateCodeUniqueWithinWindow(payload.gateCode);
    }

    const now = new Date();
    let createdRoom:
      | {
          id: string;
          roomCode: string;
          name: string;
          ownerId: string;
          gateCode: string | null;
          gateCodeExpiresAt: Date | null;
          createdAt: Date;
        }
      | null = null;

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const roomCode = createRoomCode();
      try {
        createdRoom = await prisma.$transaction(async (tx) => {
          const room = await tx.room.create({
            data: {
              roomCode,
              name: payload.name,
              ownerId: user.id,
              gateCode: payload.gateCode,
              gateCodeExpiresAt: payload.gateCode
                ? new Date(now.getTime() + GATE_CODE_TTL_MS)
                : null,
              lastActiveAt: now,
            },
          });

          await tx.roomMember.create({
            data: {
              roomId: room.id,
              userId: user.id,
              role: RoomRole.OWNER,
              status: MemberStatus.ACTIVE,
              joinedAt: now,
            },
          });

          return room;
        });
        break;
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes("Unique constraint") &&
          attempt < 5
        ) {
          continue;
        }
        throw error;
      }
    }

    if (!createdRoom) {
      throw new ApiError(500, "房间号生成失败，请重试", "ROOM_CODE_GENERATE_FAILED");
    }

    await prisma.presence.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        roomId: createdRoom.id,
        lastSeenAt: new Date(),
      },
      update: {
        roomId: createdRoom.id,
        lastSeenAt: new Date(),
      },
    });

    const response = jsonOk({
      room: {
        id: createdRoom.id,
        roomCode: createdRoom.roomCode,
        name: createdRoom.name,
        ownerId: createdRoom.ownerId,
        hasGateCode: Boolean(createdRoom.gateCode),
        gateCodeExpiresAt: createdRoom.gateCodeExpiresAt?.toISOString() ?? null,
        createdAt: createdRoom.createdAt.toISOString(),
        role: RoomRole.OWNER,
      },
    });

    return applyUserCookie(response, cookieToSet);
  } catch (error) {
    return jsonError(error);
  }
}

