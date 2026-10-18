import { MESSAGE_PAGE_SIZE } from "@/lib/constants";
import type { MessageItem } from "@/types/chat";

/** 距离底部小于该值时视为“停留在最新消息”。 */
export const MESSAGE_BOTTOM_THRESHOLD_PX = 96;
/** 距离顶部小于该值时触发更早消息加载。 */
export const MESSAGE_HISTORY_THRESHOLD_PX = 120;
/** 单次会话最多保留的消息条数，避免历史分页无限增长。 */
export const MAX_MESSAGES_IN_MEMORY = 600;

export type MessageScrollMetrics = {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
};

export function getDistanceFromBottom(metrics: MessageScrollMetrics): number {
  return Math.max(0, metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight);
}

export function isNearBottom(
  metrics: MessageScrollMetrics,
  threshold = MESSAGE_BOTTOM_THRESHOLD_PX,
): boolean {
  return getDistanceFromBottom(metrics) <= threshold;
}

export function isNearTop(
  metrics: MessageScrollMetrics,
  threshold = MESSAGE_HISTORY_THRESHOLD_PX,
): boolean {
  return metrics.scrollTop <= threshold;
}

export function resolveScrollBehavior(reducedMotion: boolean): ScrollBehavior {
  return reducedMotion ? "auto" : "smooth";
}

export function getOldestMessageAt(messages: readonly MessageItem[]): string | null {
  return messages[0]?.createdAt ?? null;
}

export function hasMoreHistoryAfterPage(
  pageLength: number,
  pageSize = MESSAGE_PAGE_SIZE,
): boolean {
  return pageLength >= pageSize;
}

/**
 * 找出上一批消息之后新增的、由其他成员发送的消息。
 *
 * 历史分页会在数组头部插入更早的消息，因此只统计 previousLatestId 之后的
 * 后缀，避免把“加载历史”误判成“新消息”。
 */
export function getAppendedMessages(
  previousLatestId: string | null,
  messages: readonly MessageItem[],
  knownIds: ReadonlySet<string>,
  selfId: string | null,
): MessageItem[] {
  if (!previousLatestId) return [];

  const previousIndex = messages.findIndex((message) => message.id === previousLatestId);
  if (previousIndex < 0) return [];

  return messages
    .slice(previousIndex + 1)
    .filter((message) => !knownIds.has(message.id) && message.sender.id !== selfId);
}

/**
 * 合并消息页：按 id 去重、按时间升序排列。
 * 传入 maxMessages 时从最旧一端截断，保留最新窗口。
 */
export function mergeMessagePages(
  existing: readonly MessageItem[],
  incoming: readonly MessageItem[],
  maxMessages?: number,
): MessageItem[] {
  const byId = new Map<string, MessageItem>();
  for (const message of existing) byId.set(message.id, message);
  for (const message of incoming) byId.set(message.id, message);

  const merged = Array.from(byId.values()).sort(compareMessages);

  if (maxMessages !== undefined && merged.length > maxMessages) {
    return merged.slice(merged.length - maxMessages);
  }

  return merged;
}

export function shouldAutoScrollToLatest(input: {
  pendingAdded: boolean;
  latestChanged: boolean;
  nearBottom: boolean;
}): boolean {
  return input.pendingAdded || (input.latestChanged && input.nearBottom);
}

/** 依据“锚点元素当前顶部 - 锚点记录顶部”的差值修正 scrollTop。 */
export function nextScrollTopForAnchor(input: {
  scrollTop: number;
  anchorTop: number;
  currentTop: number;
}): number {
  return input.scrollTop + (input.currentTop - input.anchorTop);
}

function compareMessages(a: MessageItem, b: MessageItem): number {
  const aTime = Date.parse(a.createdAt);
  const bTime = Date.parse(b.createdAt);
  const safeATime = Number.isNaN(aTime) ? 0 : aTime;
  const safeBTime = Number.isNaN(bTime) ? 0 : bTime;

  if (safeATime !== safeBTime) return safeATime - safeBTime;
  return a.id.localeCompare(b.id);
}
