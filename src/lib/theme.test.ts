import { describe, expect, it } from "vitest";
import { THEME_STORAGE_KEY, normalizeTheme } from "@/lib/theme";

describe("normalizeTheme", () => {
  it("accepts the two supported themes", () => {
    expect(normalizeTheme("light")).toBe("light");
    expect(normalizeTheme("dark")).toBe("dark");
  });

  it("falls back to dark for missing or unknown values", () => {
    expect(normalizeTheme(null)).toBe("dark");
    expect(normalizeTheme(undefined)).toBe("dark");
    expect(normalizeTheme("")).toBe("dark");
    expect(normalizeTheme("system")).toBe("dark");
  });

  it("exposes a stable storage key", () => {
    expect(THEME_STORAGE_KEY).toBe("tb:theme");
  });
});
