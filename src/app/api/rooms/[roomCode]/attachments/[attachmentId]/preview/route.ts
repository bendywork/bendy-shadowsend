import { RoomStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { ApiError, jsonError } from "@/lib/api";
import {
  isAllowedRemoteAttachmentUrl,
  resolveAttachmentReadMode,
} from "@/lib/attachment-storage";
import { fetchDufsFile } from "@/lib/dufs";
import { applyUserCookie, getOrCreateUser } from "@/lib/identity";
import { prisma } from "@/lib/prisma";
import { assertRoomMember, cleanupStaleRooms } from "@/lib/room-service";
import { createAttachmentPreviewUrl } from "@/lib/s3";

type Params = {
  roomCode: string;
  attachmentId: string;
};

function toPreviewSizeBytes(sizeBytes: number | bigint) {
  return typeof sizeBytes === "bigint" ? Number(sizeBytes) : sizeBytes;
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

    const readMode = resolveAttachmentReadMode(
      attachment.storage,
      attachment.chunkManifest,
    );

    if (readMode === "chunked") {
      throw new ApiError(
        409,
        "分片附件暂不支持在线预览",
        "CHUNKED_PREVIEW_PENDING",
      );
    }

    if (readMode === "remote") {
      if (!isAllowedRemoteAttachmentUrl(attachment.storage, attachment.s3Key)) {
        throw new ApiError(502, "远端附件地址无效", "REMOTE_ATTACHMENT_URL_INVALID");
      }

      const response = NextResponse.redirect(attachment.s3Key, 307);
      return applyUserCookie(response, cookieToSet);
    }

    if (readMode === "dufs") {
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
      sizeBytes: toPreviewSizeBytes(attachment.sizeBytes),
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
