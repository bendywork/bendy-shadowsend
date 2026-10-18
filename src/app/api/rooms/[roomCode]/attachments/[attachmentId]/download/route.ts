import { RoomStatus } from "@prisma/client";
import { NextRequest } from "next/server";
import { ApiError, jsonError, jsonOk } from "@/lib/api";
import { applyUserCookie, getOrCreateUser } from "@/lib/identity";
import { prisma } from "@/lib/prisma";
import { createRemoteAttachmentResponse } from "@/lib/upload/attachment-response";
import { resolveStoredRemoteAttachment } from "@/lib/upload/stored-manifest";
import { assertRoomMember, cleanupStaleRooms } from "@/lib/room-service";

type Params = {
  roomCode: string;
  attachmentId: string;
};

function toSizeBytes(sizeBytes: bigint) {
  return Number(sizeBytes);
}

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
        chunkManifest: true,
      },
    });

    if (!attachment) {
      throw new ApiError(404, "文件不存在", "ATTACHMENT_NOT_FOUND");
    }

    const remote = resolveStoredRemoteAttachment({
      storage: attachment.storage,
      s3Key: attachment.s3Key,
      chunkManifest: attachment.chunkManifest,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      sizeBytes: toSizeBytes(attachment.sizeBytes),
    });

    if (!remote) {
      throw new ApiError(502, "附件远端地址无效", "ATTACHMENT_REMOTE_INVALID");
    }

    const raw = request.nextUrl.searchParams.get("raw") === "1";

    if (raw) {
      const response = createRemoteAttachmentResponse({
        remote,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        disposition: "attachment",
      });
      return applyUserCookie(response, cookieToSet);
    }

    if (remote.kind === "url") {
      const response = jsonOk({ url: remote.url });
      return applyUserCookie(response, cookieToSet);
    }

    const response = jsonOk({
      url: `/api/rooms/${encodeURIComponent(roomCode)}/attachments/${encodeURIComponent(attachmentId)}/download?raw=1`,
    });
    return applyUserCookie(response, cookieToSet);
  } catch (error) {
    return jsonError(error);
  }
}
