import { describe, expect, it } from "vitest";
import {
  formatInviteExpiry,
  formatInviteRemaining,
  getInviteRemainingMs,
  getInviteStatus,
  INVITE_EXPIRING_WINDOW_MS,
} from "@/lib/invite";

const NOW = new Date(2026, 9, 18, 14, 30, 0).getTime();

describe("getInviteRemainingMs", () => {
  it("returns the distance to expiry", () => {
    const expiresAt = new Date(NOW + 90_000).toISOString();
    expect(getInviteRemainingMs(expiresAt, NOW)).toBe(90_000);
  });

  it("clamps expired and invalid timestamps to zero", () => {
    expect(getInviteRemainingMs(new Date(NOW - 1).toISOString(), NOW)).toBe(0);
    expect(getInviteRemainingMs("not-a-date", NOW)).toBe(0);
    expect(getInviteRemainingMs(null, NOW)).toBe(0);
  });
});

describe("getInviteStatus", () => {
  it("is active outside the final minute", () => {
    const expiresAt = new Date(NOW + INVITE_EXPIRING_WINDOW_MS + 1).toISOString();
    expect(getInviteStatus(expiresAt, NOW)).toBe("active");
  });

  it("is expiring inside the final minute", () => {
    const expiresAt = new Date(NOW + INVITE_EXPIRING_WINDOW_MS).toISOString();
    expect(getInviteStatus(expiresAt, NOW)).toBe("expiring");
  });

  it("is expired once the deadline passes", () => {
    expect(getInviteStatus(new Date(NOW).toISOString(), NOW)).toBe("expired");
    expect(getInviteStatus(null, NOW)).toBe("expired");
  });
});

describe("formatInviteRemaining", () => {
  it("formats mm:ss with tabular padding", () => {
    expect(formatInviteRemaining(9 * 60_000 + 5_000)).toBe("09:05");
    expect(formatInviteRemaining(59_000)).toBe("00:59");
  });

  it("rounds up so the last second is not cut short", () => {
    expect(formatInviteRemaining(1)).toBe("00:01");
    expect(formatInviteRemaining(0)).toBe("00:00");
  });
});

describe("formatInviteExpiry", () => {
  it("labels same-day and next-day deadlines in Chinese", () => {
    const laterToday = new Date(NOW + 60 * 60_000).toISOString();
    expect(formatInviteExpiry(laterToday, "zh", NOW)).toMatch(/^今天 /);

    const tomorrow = new Date(2026, 9, 19, 9, 5, 0).toISOString();
    expect(formatInviteExpiry(tomorrow, "zh", NOW)).toMatch(/^明天 /);
  });

  it("uses an absolute date beyond tomorrow and handles bad input", () => {
    const later = new Date(2026, 9, 21, 9, 5, 0).toISOString();
    expect(formatInviteExpiry(later, "zh", NOW)).toMatch(/^10月21日 /);
    expect(formatInviteExpiry("not-a-date", "en", NOW)).toBe("—");
  });
});
