import { MemberStatus, RoomStatus } from "@prisma/client";
import { NextRequest } from "next/server";
import { customAlphabet } from "nanoid";
import { ApiError, jsonError, jsonOk } from "@/lib/api";
import { INVITE_TTL_MS } from "@/lib/constants";
import { applyUserCookie, getOrCreateUser } from "@/lib/identity";
import { prisma } from "@/lib/prisma";
import { parseJsonBody } from "@/lib/route";
import { cleanupStaleRooms, touchRoom } from "@/lib/room-service";
import { inviteSchema } from "@/lib/validators";

const inviteToken = customAlphabet("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", 24);

type Params = {
  roomCode: string;
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    await cleanupStaleRooms();

    const payload = await parseJsonBody(request, inviteSchema);
    const { roomCode } = await params;
    const { user, cookieToSet } = await getOrCreateUser(request);

    const room = await prisma.room.findUnique({
      where: { roomCode },
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
      throw new ApiError(403, "你不是房间成员，无法邀请", "NOT_ROOM_MEMBER");
    }

    const expiresInMs = (payload.expiresInMinutes ?? INVITE_TTL_MS / 60_000) * 60_000;
    const expiresAt = new Date(Date.now() + expiresInMs);

    const invite = await prisma.roomInvite.create({
      data: {
        roomId: room.id,
        inviterId: user.id,
        token: inviteToken(),
        expiresAt,
      },
      select: {
        token: true,
        expiresAt: true,
      },
    });

    await touchRoom(room.id);

    const baseUrl = `${request.nextUrl.protocol}//${request.nextUrl.host}`;
    const inviteLink = `${baseUrl}/?room=${encodeURIComponent(roomCode)}&invite=${encodeURIComponent(invite.token)}`;

    const response = jsonOk({
      inviteLink,
      expiresAt: invite.expiresAt.toISOString(),
    });

    return applyUserCookie(response, cookieToSet);
  } catch (error) {
    return jsonError(error);
  }
}
