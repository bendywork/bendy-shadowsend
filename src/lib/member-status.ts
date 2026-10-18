import { ONLINE_WINDOW_MS } from "@/lib/constants";

export type LastActiveDescriptor =
  | { kind: "never" }
  | { kind: "justNow" }
  | { kind: "minutes"; count: number }
  | { kind: "hours"; count: number }
  | { kind: "days"; count: number };

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** 在线口径与后端 /api/presence 的 ONLINE_WINDOW_MS 保持一致。 */
export function isMemberOnline(lastSeenAt: string | null, now = Date.now()): boolean {
  if (!lastSeenAt) return false;

  const seenAt = new Date(lastSeenAt).getTime();
  if (!Number.isFinite(seenAt)) return false;

  return now - seenAt <= ONLINE_WINDOW_MS;
}

/** 把最后活跃时间收敛为稳定的描述，交给 i18n 层拼文案。 */
export function describeLastActive(lastSeenAt: string | null, now = Date.now()): LastActiveDescriptor {
  if (!lastSeenAt) return { kind: "never" };

  const seenAt = new Date(lastSeenAt).getTime();
  if (!Number.isFinite(seenAt)) return { kind: "never" };

  // 时钟漂移时按“刚刚”处理，避免出现负数时间。
  const elapsed = Math.max(0, now - seenAt);

  if (elapsed < MINUTE_MS) return { kind: "justNow" };
  if (elapsed < HOUR_MS) return { kind: "minutes", count: Math.floor(elapsed / MINUTE_MS) };
  if (elapsed < DAY_MS) return { kind: "hours", count: Math.floor(elapsed / HOUR_MS) };
  return { kind: "days", count: Math.floor(elapsed / DAY_MS) };
}
