import { describe, expect, it } from "vitest";
import {
  AVATAR_COLOR_POOL,
  isNeutralAvatarColor,
  resolveAvatarColor,
} from "@/lib/avatar-color";

describe("avatar color guard (dc-02)", () => {
  it("keeps every current palette value", () => {
    for (const color of AVATAR_COLOR_POOL) {
      expect(resolveAvatarColor(color, "seed")).toBe(color);
    }
  });

  it("accepts and normalizes legacy neutral gray values", () => {
    expect(resolveAvatarColor("#6B7280", "seed")).toBe("#6b7280");
    expect(resolveAvatarColor("#4B5563", "seed")).toBe("#4b5563");
    expect(resolveAvatarColor("#444", "seed")).toBe("#444444");
  });

  it("rejects legacy saturated accent colors", () => {
    const legacyAccents = ["#0a84ff", "#0071e3", "#1d4ed8", "#0f766e", "#b45309"];
    for (const color of legacyAccents) {
      const resolved = resolveAvatarColor(color, "user-1");
      expect(resolved).not.toBe(color);
      expect(AVATAR_COLOR_POOL).toContain(resolved);
      expect(isNeutralAvatarColor(resolved)).toBe(true);
    }
  });

  it("falls back deterministically for invalid values", () => {
    const first = resolveAvatarColor("not-a-color", "stable-seed");
    const second = resolveAvatarColor("not-a-color", "stable-seed");
    expect(first).toBe(second);
    expect(AVATAR_COLOR_POOL).toContain(first);
  });

  it("handles empty and missing values", () => {
    for (const value of [undefined, null, "", "   "]) {
      const resolved = resolveAvatarColor(value, "empty-seed");
      expect(AVATAR_COLOR_POOL).toContain(resolved);
    }
  });

  it("classifies short and long hex values", () => {
    expect(isNeutralAvatarColor("#333")).toBe(true);
    expect(isNeutralAvatarColor("#f00")).toBe(false);
    expect(isNeutralAvatarColor("#3f3f46")).toBe(true);
    expect(isNeutralAvatarColor("#0a84ff")).toBe(false);
    expect(isNeutralAvatarColor("rgb(0,0,0)")).toBe(false);
  });

  it("keeps every palette entry neutral", () => {
    for (const color of AVATAR_COLOR_POOL) {
      expect(isNeutralAvatarColor(color)).toBe(true);
    }
  });
});
