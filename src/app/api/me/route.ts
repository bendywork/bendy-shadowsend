import { NextRequest } from "next/server";
import { jsonError, jsonOk } from "@/lib/api";
import { applyUserCookie, getOrCreateUser } from "@/lib/identity";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { user, cookieToSet } = await getOrCreateUser(request);

    await prisma.presence.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        roomId: null,
        lastSeenAt: new Date(),
      },
      update: {
        lastSeenAt: new Date(),
      },
    });

    const response = jsonOk({
      user: {
        id: user.id,
        nickname: user.nickname,
        avatarInitial: user.avatarInitial,
        avatarColor: user.avatarColor,
      },
    });

    return applyUserCookie(response, cookieToSet);
  } catch (error) {
    return jsonError(error);
  }
}

