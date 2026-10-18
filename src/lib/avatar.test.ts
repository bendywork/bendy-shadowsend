import { describe, expect, it } from "vitest";
import { resolveAvatarForeground } from "@/lib/avatar";
import { contrastRatio } from "@/lib/color";

const AVATAR_COLORS = [
  "#3f3f46",
  "#52525b",
  "#71717a",
  "#a1a1aa",
  "#27272a",
  "#404040",
  "#737373",
  "#6b6b73",
  "#4b4b52",
];

describe("avatar foreground", () => {
  it("keeps every palette color at 4.5:1 or better", () => {
    for (const color of AVATAR_COLORS) {
      const foreground = resolveAvatarForeground(color);
      expect(foreground).not.toBeNull();
      expect(contrastRatio(foreground as string, color)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("uses dark ink on light avatar colors and white on dark colors", () => {
    expect(resolveAvatarForeground("#a1a1aa")).toBe("#111113");
    expect(resolveAvatarForeground("#27272a")).toBe("#ffffff");
  });

  it("returns null for invalid colors so the CSS fallback applies", () => {
    expect(resolveAvatarForeground("not-a-color")).toBeNull();
  });
});
