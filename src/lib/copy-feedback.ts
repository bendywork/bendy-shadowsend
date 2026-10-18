import type { MessageKey } from "@/lib/i18n/messages";

/**
 * 复制反馈的共享契约（REQ-202610-0494 / ui-31）。
 *
 * - 有常驻可见文案的复制按钮使用「图标态」：按钮自身切换成功/失败文案。
 * - 纯图标按钮使用「Toast」：图标短暂变化 + 全局 Toast 确认结果。
 * - 两种场景共用同一时长与文案键，避免各写各的。
 */
export const COPY_FEEDBACK_DURATION_MS = 1600;

export type CopyFeedbackState = "idle" | "copied" | "failed";

export const COPY_FEEDBACK_MESSAGE_KEYS: Record<
  Exclude<CopyFeedbackState, "idle">,
  MessageKey
> = {
  copied: "chat.copied",
  failed: "chat.copyFailed",
};

export function getCopyFeedbackMessageKey(
  state: CopyFeedbackState,
): MessageKey | null {
  if (state === "idle") return null;
  return COPY_FEEDBACK_MESSAGE_KEYS[state];
}
