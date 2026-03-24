import { MemberStatus, RoomRole, RoomStatus } from "@prisma/client";
import { NextRequest } from "next/server";
import {
  buildAnnouncementImageViews,
  parseAnnouncementImages,
} from "@/lib/announcement";
import { APP_NAME, APP_OPEN_SOURCE, MESSAGE_PAGE_SIZE } from "@/lib/constants";
import { env } from "@/lib/env";
import { ApiError, jsonError, jsonOk } from "@/lib/api";
import { enrichMessagesWithAttachmentPreviewUrls } from "@/lib/attachment-preview";
import { applyUserCookie, getOrCreateUser } from "@/lib/identity";
import { prisma } from "@/lib/prisma";
import { mapClientMessage } from "@/lib/serializers";
import { cleanupStaleRooms, getOnlineStats } from "@/lib/room-service";

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
      include: {
        owner: {
          select: {
            id: true,
            nickname: true,
            avatarInitial: true,
            avatarColor: true,
          },
        },
      },
    });

    if (!room || room.status !== RoomStatus.ACTIVE) {
      throw new ApiError(404, "房间不存在或已销毁", "ROOM_NOT_FOUND");
    }

    const membership = await prisma.roomMember.findUnique({
      where: {
        roomId_userId: {
          roomId: room.id,
          userId: user.id,
        },
      },
    });

    if (!membership) {
      throw new ApiError(403, "你还未加入该房间", "NOT_ROOM_MEMBER");
    }

    if (membership.status === MemberStatus.PENDING) {
      const response = jsonOk({
        room: {
          roomCode: room.roomCode,
          name: room.name,
        },
        waitingApproval: true,
      });
      return applyUserCookie(response, cookieToSet);
    }

    if (membership.status !== MemberStatus.ACTIVE) {
      throw new ApiError(403, "你当前无法访问该房间", "MEMBER_INACTIVE");
    }

    const [members, messagesRaw, stats, pendingRequests] = await Promise.all([
      prisma.roomMember.findMany({
        where: {
          roomId: room.id,
          status: MemberStatus.ACTIVE,
        },
        include: {
          user: {
            select: {
              id: true,
              nickname: true,
              avatarInitial: true,
              avatarColor: true,
            },
          },
        },
        orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
      }),
      prisma.message.findMany({
        where: {
          roomId: room.id,
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
          createdAt: "desc",
        },
        take: MESSAGE_PAGE_SIZE,
      }),
      getOnlineStats(room.id),
      membership.role === RoomRole.OWNER
        ? prisma.joinRequest.findMany({
            where: {
              roomId: room.id,
              status: "PENDING",
            },
            include: {
              user: {
                select: {
                  id: true,
                  nickname: true,
                  avatarInitial: true,
                  avatarColor: true,
                },
              },
            },
            orderBy: {
              createdAt: "asc",
            },
          })
        : Promise.resolve([]),
    ]);

    const announcementImages = buildAnnouncementImageViews(
      roomCode,
      parseAnnouncementImages(room),
    );

    const showAnnouncementToMe = Boolean(
      (room.announcementText || announcementImages.length > 0) &&
        room.announcementUpdatedAt &&
        membership.joinedAt &&
        membership.joinedAt.getTime() > room.announcementUpdatedAt.getTime() &&
        !membership.announcementSeenAt,
    );

    const messagesWithPreview = await enrichMessagesWithAttachmentPreviewUrls(
      messagesRaw.reverse(),
      {
        roomCode,
        cookieHeader: request.headers.get("cookie") ?? undefined,
        expiresInSeconds: 3600,
        logLabel: "room-snapshot",
      },
    );

    const response = jsonOk({
      app: {
        name: APP_NAME,
        version: env.appVersion,
        openSource: APP_OPEN_SOURCE,
      },
      room: {
        id: room.id,
        roomCode: room.roomCode,
        name: room.name,
        ownerId: room.ownerId,
        owner: room.owner,
        hasGateCode: Boolean(room.gateCode),
        gateCodeExpiresAt: room.gateCodeExpiresAt?.toISOString() ?? null,
        gateCode: membership.role === RoomRole.OWNER ? room.gateCode : null,
        neverExpire: room.neverExpire,
      },
      announcement: {
        text: room.announcementText,
        imageUrl: announcementImages[0]?.imageUrl ?? null,
        imageName: announcementImages[0]?.imageName ?? null,
        images: announcementImages,
        updatedAt: room.announcementUpdatedAt?.toISOString() ?? null,
        showToMe: showAnnouncementToMe,
      },
      me: {
        id: user.id,
        nickname: user.nickname,
        avatarInitial: user.avatarInitial,
        avatarColor: user.avatarColor,
        role: membership.role,
      },
      members: members.map((member) => ({
        id: member.id,
        userId: member.userId,
        role: member.role,
        status: member.status,
        joinedAt: member.joinedAt?.toISOString() ?? null,
        lastSeenAt: member.lastSeenAt?.toISOString() ?? null,
        requiresApproval: member.requiresApproval,
        user: member.user,
      })),
      pendingRequests: pendingRequests.map((requestItem) => ({
        id: requestItem.id,
        status: requestItem.status,
        reason: requestItem.reason,
        createdAt: requestItem.createdAt.toISOString(),
        user: requestItem.user,
      })),
      messages: messagesWithPreview.map(mapClientMessage),
      stats: {
        roomOnline: stats.roomOnline,
        totalOnline: stats.totalOnline,
      },
    });

    return applyUserCookie(response, cookieToSet);
  } catch (error) {
    return jsonError(error);
  }
}
