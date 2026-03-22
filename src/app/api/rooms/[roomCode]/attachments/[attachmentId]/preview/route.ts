import { AttachmentStorage, RoomStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { ApiError, jsonError } from "@/lib/api";
import { fetchDufsFile } from "@/lib/dufs";
import { applyUserCookie, getOrCreateUser } from "@/lib/identity";
import { prisma } from "@/lib/prisma";
import { assertRoomMember, cleanupStaleRooms } from "@/lib/room-service";
import { createAttachmentPreviewUrl } from "@/lib/s3";

type Params = {
  roomCode: string;
  attachmentId: string;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    await cleanupStaleRooms();

    const { roomCode, attachmentId } = await params;
    const { user, cookieToSet } = await getOrCreateUser(request);

    const room = await prisma.room.findUnique({
      where: { roomCode },
      select: { id: true, status: true },
    });

    if (!room || room.status !== RoomStatus.ACTIVE) {
      throw new ApiError(404, "房间不存在或已销毁", "ROOM_NOT_FOUND");
    }

    await assertRoomMember(room.id, user.id);

    const attachment = await prisma.messageAttachment.findFirst({
      where: {
        id: attachmentId,
        roomId: room.id,
      },
      select: {
        id: true,
        s3Key: true,
        fileName: true,
        mimeType: true,
        sizeBytes: true,
        storage: true,
      },
    });

    if (!attachment) {
      throw new ApiError(404, "文件不存在", "ATTACHMENT_NOT_FOUND");
    }

    if (attachment.storage === AttachmentStorage.DUFS) {
      const upstream = await fetchDufsFile(attachment.s3Key);
      const response = new NextResponse(upstream.body, {
        status: 200,
        headers: {
          "Content-Type": upstream.headers.get("content-type") || attachment.mimeType,
          "Cache-Control": "private, max-age=60",
        },
      });

      return applyUserCookie(response, cookieToSet);
    }

    const previewUrl = await createAttachmentPreviewUrl({
      key: attachment.s3Key,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      cookieHeader: request.headers.get("cookie") ?? undefined,
      expiresInSeconds: 120,
    });

    const response = NextResponse.redirect(previewUrl, 307);
    return applyUserCookie(response, cookieToSet);
  } catch (error) {
    console.error("[route] /api/rooms/[roomCode]/attachments/[attachmentId]/preview failed", {
      path: request.nextUrl.pathname,
      method: request.method,
      error,
    });
    return jsonError(error);
  }
}
