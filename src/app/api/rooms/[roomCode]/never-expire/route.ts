import { MemberStatus, RoomRole, RoomStatus } from "@prisma/client";
import { NextRequest } from "next/server";
import { ApiError, jsonError, jsonOk } from "@/lib/api";
import { applyUserCookie, getOrCreateUser } from "@/lib/identity";
import { prisma } from "@/lib/prisma";
import { parseJsonBody } from "@/lib/route";
import { cleanupStaleRooms } from "@/lib/room-service";
import { updateRoomNeverExpireSchema } from "@/lib/validators";

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
    const payload = await parseJsonBody(request, updateRoomNeverExpireSchema);

    const room = await prisma.room.findUnique({
      where: { roomCode },
      select: {
        id: true,
        status: true,
      },
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

    if (!member || member.status !== MemberStatus.ACTIVE || member.role !== RoomRole.OWNER) {
      throw new ApiError(403, "仅房主可修改过期策略", "FORBIDDEN_UPDATE_NEVER_EXPIRE");
    }

    const updated = await prisma.room.update({
      where: { id: room.id },
      data: {
        neverExpire: payload.neverExpire,
        lastActiveAt: new Date(),
      },
      select: {
        neverExpire: true,
      },
    });

    const response = jsonOk({
      neverExpire: updated.neverExpire,
    });

    return applyUserCookie(response, cookieToSet);
  } catch (error) {
    return jsonError(error);
  }
}

