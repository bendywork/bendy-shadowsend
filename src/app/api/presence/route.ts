import { MemberStatus, RoomStatus } from "@prisma/client";
import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, jsonError, jsonOk } from "@/lib/api";
import { applyUserCookie, getOrCreateUser } from "@/lib/identity";
import { prisma } from "@/lib/prisma";
import { cleanupStaleRooms, touchRoom } from "@/lib/room-service";
import { parseJsonBody } from "@/lib/route";

const schema = z.object({
  roomCode: z.string().trim().optional(),
});

export async function POST(request: NextRequest) {
  try {
    await cleanupStaleRooms();

    const { user, cookieToSet } = await getOrCreateUser(request);
    const payload = await parseJsonBody(request, schema);

    let roomId: string | null = null;

    if (payload.roomCode) {
      const room = await prisma.room.findUnique({
        where: { roomCode: payload.roomCode },
        select: { id: true, status: true },
      });

      if (!room || room.status !== RoomStatus.ACTIVE) {
        throw new ApiError(404, "房间不存在或已销毁", "ROOM_NOT_FOUND");
      }

      const member = await prisma.roomMember.findUnique({
        where: {
          roomId_userId: {
            roomId: room.id,
            userId: user.id,
          },
        },
      });

      if (!member || member.status !== MemberStatus.ACTIVE) {
        throw new ApiError(403, "不是房间成员，无法上报在线状态", "NOT_ROOM_MEMBER");
      }

      roomId = room.id;
      await touchRoom(room.id);

      await prisma.roomMember.update({
        where: { id: member.id },
        data: { lastSeenAt: new Date() },
      });
    }

    await prisma.presence.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        roomId,
        lastSeenAt: new Date(),
      },
      update: {
        roomId,
        lastSeenAt: new Date(),
      },
    });

    const response = jsonOk({ success: true });
    return applyUserCookie(response, cookieToSet);
  } catch (error) {
    return jsonError(error);
  }
}

