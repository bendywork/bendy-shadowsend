import { RoomStatus } from "@prisma/client";
import { NextRequest } from "next/server";
import { ApiError, jsonError, jsonOk } from "@/lib/api";
import { createRemoteAttachmentResponse, resolveRemoteAttachment } from "@/lib/attachment-response";
import { applyUserCookie, getOrCreateUser } from "@/lib/identity";
import { prisma } from "@/lib/prisma";
import { assertRoomMember, cleanupStaleRooms } from "@/lib/room-service";

export const runtime = "nodejs";
export const maxDuration = 300;

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
        storage: true,
        sizeBytes: true,
        chunkManifest: true,
      },
    });

    if (!attachment) {
      throw new ApiError(404, "文件不存在", "ATTACHMENT_NOT_FOUND");
    }

    const raw = request.nextUrl.searchParams.get("raw") === "1";

    const remote = resolveRemoteAttachment(attachment);
    if (raw) {
      const response = await createRemoteAttachmentResponse(attachment, {
        disposition: "attachment", range: request.headers.get("range"), signal: request.signal,
      });
      return applyUserCookie(response, cookieToSet);
    }
    const response = jsonOk({
      url: `/api/rooms/${encodeURIComponent(roomCode)}/attachments/${encodeURIComponent(attachmentId)}/download?raw=1`,
      fileName: remote.fileName,
      mimeType: remote.mimeType,
      sizeBytes: remote.sizeBytes,
      chunked: Boolean(remote.chunkManifest),
      totalChunks: remote.chunkManifest?.chunks.length ?? 1,
    });
    return applyUserCookie(response, cookieToSet);
  } catch (error) {
    return jsonError(error);
  }
}
