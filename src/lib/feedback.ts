import { ApiRequestError } from "@/lib/client";
import { toast } from "@/lib/toast-store";
import type { MessageKey } from "@/lib/i18n/messages";

export type FeedbackTranslator = (
  key: MessageKey,
  params?: Record<string, string | number>,
) => string;

/**
 * Transport-level failures that should be shown as one readable network
 * message instead of leaking URL/method or browser internals to the user.
 */
const NETWORK_ERROR_PATTERNS = [
  "网络请求失败",
  "failed to fetch",
  "networkerror",
  "network error",
  "load failed",
  "network request failed",
  "err_network",
  "err_internet_disconnected",
  "the internet connection appears to be offline",
];

/** Generic messages that carry no actionable information. */
const GENERIC_ERROR_MESSAGES = new Set([
  "请求失败",
  "failed to fetch",
  "network error",
  "load failed",
]);

/** Response parsing failures are technical details, not user-facing copy. */
const TECHNICAL_ERROR_PATTERNS = [
  "读取响应失败",
  "解析响应失败",
  "invalid response",
  "unexpected token",
];

export function isNetworkError(error: unknown): boolean {
  if (error instanceof ApiRequestError && error.code === "NETWORK_ERROR") {
    return true;
  }

  if (error instanceof TypeError) {
    const message = error.message.toLowerCase();
    return NETWORK_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
  }

  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return NETWORK_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
}

/**
 * Turn any thrown value into copy that can be shown to the user.
 * Server-provided messages are preserved; transport/internal details fall
 * back to the caller's localized message.
 */
export function resolveErrorMessage(
  error: unknown,
  fallback: string,
  t: FeedbackTranslator,
): string {
  if (isNetworkError(error)) {
    return t("toast.networkError");
  }

  if (error instanceof ApiRequestError) {
    if (
      error.code === "INTERNAL_SERVER_ERROR" ||
      error.code === "INVALID_RESPONSE" ||
      (error.status ?? 0) >= 500
    ) {
      return fallback;
    }

    const message = error.message.trim();
    if (message && !GENERIC_ERROR_MESSAGES.has(message.toLowerCase())) {
      return message;
    }
    return fallback;
  }

  if (error instanceof Error) {
    const message = error.message.trim();
    if (
      !message ||
      GENERIC_ERROR_MESSAGES.has(message.toLowerCase()) ||
      TECHNICAL_ERROR_PATTERNS.some((pattern) =>
        message.toLowerCase().includes(pattern),
      )
    ) {
      return fallback;
    }
    return message;
  }

  return fallback;
}

/** Show one error toast and return the resolved copy for inline surfaces. */
export function toastError(
  error: unknown,
  fallback: string,
  t: FeedbackTranslator,
): string {
  const message = resolveErrorMessage(error, fallback, t);
  toast.error(message);
  return message;
}
