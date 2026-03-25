import { ApiError } from "@/lib/api";

let offlineTimer: NodeJS.Timeout | null = null;
let scheduledOfflineAt: Date | null = null;

export function getScheduledOfflineAt() {
  return scheduledOfflineAt;
}

export function scheduleOfflineAt(targetAt: Date) {
  const delayMs = targetAt.getTime() - Date.now();
  if (!Number.isFinite(delayMs) || delayMs < 0) {
    throw new ApiError(400, "time must be in the future", "INVALID_OFFLINE_TIME");
  }

  if (offlineTimer) {
    clearTimeout(offlineTimer);
    offlineTimer = null;
  }

  scheduledOfflineAt = targetAt;
  offlineTimer = setTimeout(() => {
    console.info("[system:offline] executing process exit", {
      targetAt: targetAt.toISOString(),
      now: new Date().toISOString(),
    });
    process.exit(0);
  }, delayMs);
}

export function triggerOfflineSoon(delayMs = 100) {
  const targetAt = new Date(Date.now() + Math.max(0, delayMs));
  scheduleOfflineAt(targetAt);
  return targetAt;
}
