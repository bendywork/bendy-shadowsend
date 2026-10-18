export const MESSAGE_GROUP_WINDOW_MS = 5 * 60 * 1000;

export type MessageGroupPosition = "single" | "first" | "middle" | "last";

export type MessageDeliveryState = "sent" | "read";

export type GroupableMessage = {
  senderId: string;
  createdAt: string;
};

export type DeliveryMember = {
  userId: string;
  lastSeenAt: string | null;
};

function toTimestamp(value: string): number | null {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

/** Consecutive messages from one sender within the grouping window share a bubble group. */
export function isSameMessageGroup(
  previous: GroupableMessage,
  current: GroupableMessage,
): boolean {
  if (previous.senderId !== current.senderId) return false;

  const previousTime = toTimestamp(previous.createdAt);
  const currentTime = toTimestamp(current.createdAt);
  if (previousTime === null || currentTime === null) return false;

  return Math.abs(currentTime - previousTime) <= MESSAGE_GROUP_WINDOW_MS;
}

/**
 * Classify each message inside its run of consecutive same-sender messages.
 * The renderer uses this to show one avatar/name per group and to tighten
 * spacing between bubbles that belong together.
 */
export function getMessageGroupPositions(
  messages: readonly GroupableMessage[],
): MessageGroupPosition[] {
  const positions: MessageGroupPosition[] = messages.map(() => "single");
  let groupStart = 0;

  for (let index = 1; index <= messages.length; index += 1) {
    const groupEnds =
      index === messages.length ||
      !isSameMessageGroup(messages[index - 1], messages[index]);

    if (!groupEnds) continue;

    const groupEnd = index - 1;
    if (groupStart === groupEnd) {
      positions[groupStart] = "single";
    } else {
      positions[groupStart] = "first";
      positions[groupEnd] = "last";
      for (let middle = groupStart + 1; middle < groupEnd; middle += 1) {
        positions[middle] = "middle";
      }
    }

    groupStart = index;
  }

  return positions;
}

/**
 * Own messages are "read" once any other member's last-seen timestamp has
 * caught up with the message. This mirrors the existing presence heartbeat
 * window without adding a read-receipt table.
 */
export function getMessageDeliveryState(
  message: { senderId: string; createdAt: string },
  meId: string,
  members: readonly DeliveryMember[],
): MessageDeliveryState | null {
  if (message.senderId !== meId) return null;

  const messageTime = toTimestamp(message.createdAt);
  if (messageTime === null) return "sent";

  const readByOthers = members.some((member) => {
    if (member.userId === meId || !member.lastSeenAt) return false;
    const seenAt = toTimestamp(member.lastSeenAt);
    return seenAt !== null && seenAt >= messageTime;
  });

  return readByOthers ? "read" : "sent";
}

const LOCALES = { zh: "zh-CN", en: "en-US" } as const;

const TIME_FORMATTERS = {
  zh: new Intl.DateTimeFormat(LOCALES.zh, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }),
  en: new Intl.DateTimeFormat(LOCALES.en, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }),
} as const;

const MONTH_DAY_FORMATTERS = {
  zh: new Intl.DateTimeFormat(LOCALES.zh, { month: "2-digit", day: "2-digit" }),
  en: new Intl.DateTimeFormat(LOCALES.en, { month: "2-digit", day: "2-digit" }),
} as const;

const FULL_DATE_FORMATTERS = {
  zh: new Intl.DateTimeFormat(LOCALES.zh, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }),
  en: new Intl.DateTimeFormat(LOCALES.en, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }),
} as const;

/** Compact chat timestamp: time for today, date + time for older messages. */
export function formatMessageTime(
  iso: string,
  lang: "zh" | "en",
  now: Date = new Date(),
): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";

  const time = TIME_FORMATTERS[lang].format(date);
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) return time;

  if (date.getFullYear() === now.getFullYear()) {
    return `${MONTH_DAY_FORMATTERS[lang].format(date)} ${time}`;
  }

  return `${FULL_DATE_FORMATTERS[lang].format(date)} ${time}`;
}
