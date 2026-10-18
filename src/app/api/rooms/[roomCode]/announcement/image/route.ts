import { RoomStatus } from "@prisma/client";
import { NextRequest } from "next/server";
import { parseAnnouncementImages } from "@/lib/announcement";
import { ApiError, jsonError } from "@/lib/api";
import { applyUserCookie, getOrCreateUser } from "@/lib/identity";
import { prisma } from "@/lib/prisma";
import { assertRoomMember, cleanupStaleRooms } from "@/lib/room-service";
import { createRemoteAttachmentResponse } from "@/lib/upload/attachment-response";
import { resolveStoredRemoteAttachment } from "@/lib/upload/stored-manifest";

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

    const announcement = await prisma.room.findUnique({
      where: { id: room.id },
      select: {
        announcementImageKey: true,
        announcementImageName: true,
        announcementImageStorage: true,
      },
    });

    const indexParam = request.nextUrl.searchParams.get("index");
    const parsedIndex = Number.parseInt(indexParam ?? "0", 10);
    const index = Number.isFinite(parsedIndex) && parsedIndex >= 0 ? parsedIndex : 0;

    const images = parseAnnouncementImages({
      announcementImageKey: announcement?.announcementImageKey ?? null,
      announcementImageName: announcement?.announcementImageName ?? null,
      announcementImageStorage: announcement?.announcementImageStorage ?? null,
    });

    const image = images[index];

    if (!image) {
      throw new ApiError(404, "公告图片不存在", "ANNOUNCEMENT_IMAGE_NOT_FOUND");
    }

    const remote = resolveStoredRemoteAttachment({
      storage: image.storage,
      s3Key: image.s3Key,
      chunkManifest: image.chunkManifest,
      fileName: image.fileName,
      mimeType: image.mimeType,
      sizeBytes: image.sizeBytes,
    });

    if (!remote) {
      throw new ApiError(502, "公告图片地址无效", "REMOTE_ATTACHMENT_URL_INVALID");
    }

    const response = createRemoteAttachmentResponse({
      remote,
      fileName: image.fileName,
      mimeType: image.mimeType,
      disposition: "inline",
    });
    return applyUserCookie(response, cookieToSet);
  } catch (error) {
    return jsonError(error);
  }
}
