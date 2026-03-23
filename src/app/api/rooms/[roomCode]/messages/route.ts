import { MemberStatus, MessageType, RoomStatus } from "@prisma/client";
import { NextRequest } from "next/server";
import { ApiError, jsonError, jsonOk } from "@/lib/api";
import { enrichMessagesWithAttachmentPreviewUrls } from "@/lib/attachment-preview";
import { MESSAGE_PAGE_SIZE } from "@/lib/constants";
import { encryptText } from "@/lib/encryption";
import { applyUserCookie, getOrCreateUser } from "@/lib/identity";
import { prisma } from "@/lib/prisma";
import { parseJsonBody } from "@/lib/route";
import { mapClientMessage } from "@/lib/serializers";
import { assertRoomMember, cleanupStaleRooms, resolvePreviewType, touchRoom } from "@/lib/room-service";
import { sendMessageSchema } from "@/lib/validators";

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

    const beforeRaw = request.nextUrl.searchParams.get("before");
    const afterRaw = request.nextUrl.searchParams.get("after");

    if (beforeRaw && afterRaw) {
      throw new ApiError(400, "before 与 after 不能同时使用", "INVALID_MESSAGE_QUERY");
    }

    const before = beforeRaw ? new Date(beforeRaw) : null;
    const after = afterRaw ? new Date(afterRaw) : null;

    if (before && Number.isNaN(before.getTime())) {
      throw new ApiError(400, "before 参数无效", "INVALID_BEFORE_PARAM");
    }

    if (after && Number.isNaN(after.getTime())) {
      throw new ApiError(400, "after 参数无效", "INVALID_AFTER_PARAM");
    }

    const isIncrementalFetch = Boolean(after);

    const messages = await prisma.message.findMany({
      where: {
        roomId: room.id,
        ...(before ? { createdAt: { lt: before } } : {}),
        ...(after ? { createdAt: { gte: after } } : {}),
      },
      include: {
        sender: {
          select: {
            id: true,
            nickname: true,
            avatarInitial: true,
            avatarColor: true,
          },
        },
        attachments: true,
      },
      orderBy: {
        createdAt: isIncrementalFetch ? "asc" : "desc",
      },
      take: isIncrementalFetch ? 80 : MESSAGE_PAGE_SIZE,
    });

    const orderedMessages = isIncrementalFetch ? messages : messages.reverse();

    const messagesWithPreview = await enrichMessagesWithAttachmentPreviewUrls(
      orderedMessages,
      {
        roomCode,
        cookieHeader: request.headers.get("cookie") ?? undefined,
        expiresInSeconds: 3600,
        logLabel: isIncrementalFetch ? "message-list-incremental" : "message-list",
      },
    );

    const response = jsonOk({
      messages: messagesWithPreview.map(mapClientMessage),
    });

    return applyUserCookie(response, cookieToSet);
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    await cleanupStaleRooms();

    const { roomCode } = await params;
    const { user, cookieToSet } = await getOrCreateUser(request);
    const payload = await parseJsonBody(request, sendMessageSchema);

    const room = await prisma.room.findUnique({
      where: { roomCode },
      select: { id: true, status: true },
    });

    if (!room || room.status !== RoomStatus.ACTIVE) {
      throw new ApiError(404, "房间不存在或已销毁", "ROOM_NOT_FOUND");
    }

    const membership = await assertRoomMember(room.id, user.id);

    const hasContent = Boolean(payload.content?.trim());
    const hasAttachments = payload.attachments.length > 0;

    if (!hasContent && !hasAttachments) {
      throw new ApiError(400, "消息不能为空", "MESSAGE_EMPTY");
    }

    const type = hasContent && hasAttachments ? MessageType.MIXED : hasAttachments ? MessageType.FILE : MessageType.TEXT;

    const now = new Date();

    const message = await prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          roomId: room.id,
          senderId: user.id,
          type,
          encryptedContent: hasContent ? encryptText(payload.content!) : null,
        },
      });

      if (hasAttachments) {
        await tx.messageAttachment.createMany({
          data: payload.attachments.map((attachment) => ({
            messageId: created.id,
            roomId: room.id,
            uploaderId: user.id,
            fileName: attachment.fileName,
            mimeType: attachment.mimeType,
            sizeBytes: BigInt(attachment.sizeBytes),
            s3Key: attachment.s3Key,
            storage: attachment.storage,
            previewType: resolvePreviewType(attachment.mimeType),
          })),
        });
      }

      await tx.room.update({
        where: { id: room.id },
        data: { lastActiveAt: now },
      });

      await tx.roomMember.update({
        where: { id: membership.id },
        data: { lastSeenAt: now, status: MemberStatus.ACTIVE },
      });

      return tx.message.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          sender: {
            select: {
              id: true,
              nickname: true,
              avatarInitial: true,
              avatarColor: true,
            },
          },
          attachments: true,
        },
      });
    });

    await touchRoom(room.id);

    const [messageWithPreview] = await enrichMessagesWithAttachmentPreviewUrls(
      [message],
      {
        roomCode,
        cookieHeader: request.headers.get("cookie") ?? undefined,
        expiresInSeconds: 3600,
        logLabel: "message-create",
      },
    );

    const response = jsonOk({
      message: mapClientMessage(messageWithPreview),
    });

    return applyUserCookie(response, cookieToSet);
  } catch (error) {
    return jsonError(error);
  }
}
