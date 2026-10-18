import { RoomStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { ApiError, jsonError, jsonOk } from "@/lib/api";
import { buildAttachmentMergeManifest } from "@/lib/attachment-merge";
import {
  isAllowedRemoteAttachmentUrl,
  resolveAttachmentReadMode,
} from "@/lib/attachment-storage";
import { fetchDufsFile } from "@/lib/dufs";
import { getUploadSessionSecret } from "@/lib/env";
import { applyUserCookie, getOrCreateUser } from "@/lib/identity";
import { prisma } from "@/lib/prisma";
import { createDownloadUrl } from "@/lib/s3";
import { assertRoomMember, cleanupStaleRooms } from "@/lib/room-service";
import { manifestIntegrity } from "@/lib/upload/hash";
import { buildMergeUrl, signMergeToken } from "@/lib/upload/merge";

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
        chunkManifest: true,
      },
    });

    if (!attachment) {
      throw new ApiError(404, "文件不存在", "ATTACHMENT_NOT_FOUND");
    }

    const raw = request.nextUrl.searchParams.get("raw") === "1";
    const readMode = resolveAttachmentReadMode(
      attachment.storage,
      attachment.chunkManifest,
    );

    if (readMode === "chunked") {
      const manifest = buildAttachmentMergeManifest(attachment);
      const secret = getUploadSessionSecret();
      if (!secret) {
        throw new ApiError(503, "合并下载密钥未配置", "MERGE_SECRET_MISSING");
      }

      const token = signMergeToken({ roomId: room.id, manifest }, secret);
      const mergeUrl = buildMergeUrl(roomCode, token);

      if (raw) {
        return applyUserCookie(
          NextResponse.redirect(new URL(mergeUrl, request.url), 307),
          cookieToSet,
        );
      }

      const response = jsonOk({
        url: mergeUrl,
        fileName: manifest.fileName,
        mimeType: manifest.mimeType,
        sizeBytes: manifest.sizeBytes,
        chunked: true,
        totalChunks: manifest.totalChunks,
        chunkSize: manifest.chunkSize,
        integrity: manifestIntegrity(manifest.chunks),
      });
      return applyUserCookie(response, cookieToSet);
    }

    if (readMode === "remote") {
      if (!isAllowedRemoteAttachmentUrl(attachment.storage, attachment.s3Key)) {
        throw new ApiError(502, "远端附件地址无效", "REMOTE_ATTACHMENT_URL_INVALID");
      }

      const response = raw
        ? NextResponse.redirect(attachment.s3Key, 307)
        : jsonOk({ url: attachment.s3Key });
      return applyUserCookie(response, cookieToSet);
    }

    if (readMode === "dufs") {
      if (raw) {
        const upstream = await fetchDufsFile(attachment.s3Key);
        const response = new NextResponse(upstream.body, {
          status: 200,
          headers: {
            "Content-Type": upstream.headers.get("content-type") || attachment.mimeType,
            "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
            "Cache-Control": "private, max-age=60",
          },
        });

        return applyUserCookie(response, cookieToSet);
      }

      const response = jsonOk({
        url: `/api/rooms/${encodeURIComponent(roomCode)}/attachments/${encodeURIComponent(attachmentId)}/download?raw=1`,
      });
      return applyUserCookie(response, cookieToSet);
    }

    const downloadUrl = await createDownloadUrl({
      key: attachment.s3Key,
      filename: attachment.fileName,
      expiresInSeconds: 90,
    });

    const response = jsonOk({
      url: downloadUrl,
    });

    return applyUserCookie(response, cookieToSet);
  } catch (error) {
    return jsonError(error);
  }
}
