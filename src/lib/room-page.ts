import type { MessageItem, RoomSnapshot, RoomTreeItem } from "@/types/chat";

export const FAST_POLL_INTERVAL_MS = 1200;
export const SNAPSHOT_SYNC_INTERVAL_MS = 15_000;
export const MAX_MESSAGES_IN_MEMORY = 220;
export const MESSAGE_COLLAPSE_CHAR_THRESHOLD = 1200;
export const MESSAGE_COLLAPSE_PREVIEW_MAX = 1600;
export const MESSAGE_COLLAPSE_PREVIEW_MIN = 360;
export const AD_CAROUSEL_INTERVAL_MS = 4200;
export const AD_CAROUSEL_SLIDE_MS = 320;
export const MAX_FILES_PER_MESSAGE = 20;
export const HEX_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export const isPreviewable = (attachment: {
  previewType: MessageItem["attachments"][number]["previewType"];
}) =>
  attachment.previewType === "IMAGE" || attachment.previewType === "VIDEO";

export const hasInlinePreview = (attachment: {
  previewType: MessageItem["attachments"][number]["previewType"];
  previewUrl?: string | null;
}) => isPreviewable(attachment) && Boolean(attachment.previewUrl);

export const guessPreviewType = (
  mimeType: string,
): MessageItem["attachments"][number]["previewType"] => {
  if (mimeType.startsWith("image/")) return "IMAGE";
  if (mimeType.startsWith("video/")) return "VIDEO";
  return "NONE";
};

export const formatRoomTime = (value: string) =>
  new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

export function withStableAttachmentPreviewUrls(
  prev: RoomSnapshot | null,
  next: RoomSnapshot,
) {
  if (!prev) return next;

  const existing = new Map<string, string>();
  prev.messages.forEach((message) => {
    message.attachments.forEach((attachment) => {
      if (attachment.previewUrl) {
        existing.set(attachment.id, attachment.previewUrl);
      }
    });
  });

  return {
    ...next,
    messages: next.messages.map((message) => ({
      ...message,
      attachments: message.attachments.map((attachment) => {
        const stablePreviewUrl =
          attachment.previewUrl ?? existing.get(attachment.id) ?? null;
        return {
          ...attachment,
          previewUrl: stablePreviewUrl,
        };
      }),
    })),
  };
}

export function mergeIncomingMessages(
  prev: RoomSnapshot,
  incoming: MessageItem[],
) {
  if (incoming.length === 0) return prev;

  const existingIds = new Set(prev.messages.map((message) => message.id));
  const uniqueIncoming = incoming.filter(
    (message) => !existingIds.has(message.id),
  );

  if (uniqueIncoming.length === 0) {
    return prev;
  }

  const merged = [...prev.messages, ...uniqueIncoming];
  const trimmed =
    merged.length > MAX_MESSAGES_IN_MEMORY
      ? merged.slice(-MAX_MESSAGES_IN_MEMORY)
      : merged;

  return withStableAttachmentPreviewUrls(prev, {
    ...prev,
    messages: trimmed,
  });
}

export function getCollapsedPreviewText(content: string) {
  const halfLength = Math.floor(content.length / 2);
  const previewLength = Math.max(
    MESSAGE_COLLAPSE_PREVIEW_MIN,
    Math.min(MESSAGE_COLLAPSE_PREVIEW_MAX, halfLength),
  );
  return content.slice(0, previewLength);
}

export function isMessageCollapsed(content: string, expanded: boolean) {
  return content.length > MESSAGE_COLLAPSE_CHAR_THRESHOLD && !expanded;
}

export function sortRooms(items: RoomTreeItem[]) {
  return [...items].sort((a, b) => {
    const timeDiff =
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (timeDiff !== 0) return timeDiff;
    return a.roomCode.localeCompare(b.roomCode);
  });
}

export function getMessageDeliveryState(
  snapshot: RoomSnapshot | null,
  message: MessageItem,
): "sent" | "read" | null {
  if (!snapshot) return null;
  if (message.sender.id !== snapshot.me.id) return null;

  const messageTime = new Date(message.createdAt).getTime();
  const readByOthers = snapshot.members.some(
    (member) =>
      member.userId !== snapshot.me.id &&
      member.lastSeenAt &&
      new Date(member.lastSeenAt).getTime() >= messageTime,
  );

  return readByOthers ? "read" : "sent";
}

export type RoomMenuRect = {
  right: number;
  top: number;
  bottom: number;
};

export type RoomMenuViewport = {
  width: number;
  height: number;
};

export type RoomMenuPosition = {
  left: number;
  top: number;
};

export function computeRoomMenuPosition(
  rect: RoomMenuRect,
  viewport: RoomMenuViewport,
  menuWidth = 100,
  menuHeight = 36,
  viewportPadding = 8,
  gap = 6,
): RoomMenuPosition {
  const left = Math.max(
    viewportPadding,
    Math.min(
      viewport.width - menuWidth - viewportPadding,
      rect.right - menuWidth,
    ),
  );
  const top =
    rect.bottom + gap + menuHeight > viewport.height
      ? Math.max(viewportPadding, rect.top - menuHeight - gap)
      : rect.bottom + gap;

  return { left, top };
}
