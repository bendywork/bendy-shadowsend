export const ENTER_TO_SEND_STORAGE_KEY = "tb:enter-to-send";

/**
 * 读取持久化的布尔偏好。
 * 只有明确的 "1" / "0" 才覆盖默认值，避免新用户首次访问时
 * 因键不存在而拿到与 SSR 默认值相反的初始状态。
 */
export function readStoredBoolean(
  raw: string | null | undefined,
  fallback: boolean,
): boolean {
  if (raw === "1") return true;
  if (raw === "0") return false;
  return fallback;
}
