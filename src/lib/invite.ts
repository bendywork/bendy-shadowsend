import { INVITE_TTL_MS } from "@/lib/constants";

/** Default lifetime for a freshly minted invite link (matches the server default). */
export const INVITE_DEFAULT_MINUTES = Math.round(INVITE_TTL_MS / 60_000);

/** The link switches to the "expiring soon" tone during its last minute. */
export const INVITE_EXPIRING_WINDOW_MS = 60_000;

export type InviteStatus = "active" | "expiring" | "expired";

/**
 * Remaining lifetime in milliseconds, clamped to zero. Invalid or missing
 * timestamps are treated as already expired so the UI never offers a dead link.
 */
export function getInviteRemainingMs(
  expiresAt: string | null,
  now: number,
): number {
  if (!expiresAt) return 0;
  const expiresAtMs = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiresAtMs)) return 0;
  return Math.max(0, expiresAtMs - now);
}

export function getInviteStatus(
  expiresAt: string | null,
  now: number,
): InviteStatus {
  const remaining = getInviteRemainingMs(expiresAt, now);
  if (remaining <= 0) return "expired";
  if (remaining <= INVITE_EXPIRING_WINDOW_MS) return "expiring";
  return "active";
}

/** `mm:ss` countdown that rounds up so the last second is not shown as 00:00 early. */
export function formatInviteRemaining(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Human-readable expiry: "今天 14:32" / "明天 14:32" / "10月20日 09:05" for zh,
 * and the English equivalents for en. Invite links live at most an hour, but
 * handling the day boundary keeps the copy correct when minted near midnight.
 */
export function formatInviteExpiry(
  expiresAt: string,
  lang: "zh" | "en",
  now: number,
): string {
  const date = new Date(expiresAt);
  if (!Number.isFinite(date.getTime())) return "—";

  const time = new Intl.DateTimeFormat(lang === "zh" ? "zh-CN" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);

  const nowDate = new Date(now);
  const tomorrow = new Date(nowDate);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (isSameLocalDay(date, nowDate)) {
    return lang === "zh" ? `今天 ${time}` : `Today ${time}`;
  }
  if (isSameLocalDay(date, tomorrow)) {
    return lang === "zh" ? `明天 ${time}` : `Tomorrow ${time}`;
  }
  if (lang === "zh") {
    return `${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
  }
  const day = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
  return `${day} ${time}`;
}

/**
 * Clipboard write with a legacy `execCommand` fallback. Returns `false` instead
 * of throwing so the caller can show a single actionable error message.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text || typeof navigator === "undefined") return false;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Permission denied or insecure context: try the legacy path below.
  }

  if (typeof document === "undefined") return false;

  let textarea: HTMLTextAreaElement | null = null;
  try {
    textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "0";
    textarea.style.left = "0";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textarea?.remove();
  }
}
