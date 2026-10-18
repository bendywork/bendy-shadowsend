import { RoomStatus } from "@prisma/client";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { ApiError, jsonError } from "@/lib/api";
import { getUploadSessionSecret } from "@/lib/env";
import { applyUserCookie, getOrCreateUser } from "@/lib/identity";
import { prisma } from "@/lib/prisma";
import { assertRoomMember, cleanupStaleRooms } from "@/lib/room-service";
import { normalizeUploadError } from "@/lib/upload/errors";
import {
  buildContentDisposition,
  openMergedStream,
  verifyMergeToken,
} from "@/lib/upload/merge";

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

    await assertRoomMember(room.id, user.id);

    const token = request.nextUrl.searchParams.get("manifest");
    if (!token) {
      throw new ApiError(400, "缺少合并下载令牌", "MERGE_TOKEN_MISSING");
    }

    const secret = getUploadSessionSecret();
    if (!secret) {
      throw new ApiError(503, "合并下载密钥未配置", "MERGE_SECRET_MISSING");
    }

    const payload = verifyMergeToken(token, secret, room.id);

    const stream = await openMergedStream(payload.manifest);
    const response = new NextResponse(stream, {
      status: 200,
      headers: {
        "Content-Type": payload.manifest.mimeType,
        "Content-Length": String(payload.manifest.sizeBytes),
        "Content-Disposition": buildContentDisposition(payload.manifest.fileName),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });

    return applyUserCookie(response, cookieToSet);
  } catch (error) {
    console.error(
      "[route] /api/rooms/[roomCode]/attachments/merge failed",
      {
        path: request.nextUrl.pathname,
        method: request.method,
        error,
      },
    );
    return jsonError(normalizeUploadError(error));
  }
}
