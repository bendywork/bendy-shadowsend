import { describe, expect, it } from "vitest";
import {
  AD_CAROUSEL_INTERVAL_MS,
  AD_CAROUSEL_SLIDE_MS,
  clampAdIndex,
  getAdSlide,
  getNextAdIndex,
  normalizeAdItems,
  shouldAutoAdvance,
} from "@/lib/ad-carousel";
import type { AdBoardItem } from "@/types/chat";

const ad = (content: string, extra: Partial<AdBoardItem> = {}): AdBoardItem => ({
  content,
  color: "",
  url: "",
  ...extra,
});

describe("ad carousel timing", () => {
  it("keeps the slide shorter than the dwell interval", () => {
    expect(AD_CAROUSEL_SLIDE_MS).toBeGreaterThan(0);
    expect(AD_CAROUSEL_SLIDE_MS).toBeLessThan(AD_CAROUSEL_INTERVAL_MS);
  });

  it("only auto-advances with multiple items and while not paused", () => {
    expect(shouldAutoAdvance(0, false)).toBe(false);
    expect(shouldAutoAdvance(1, false)).toBe(false);
    expect(shouldAutoAdvance(2, false)).toBe(true);
    expect(shouldAutoAdvance(2, true)).toBe(false);
  });
});

describe("ad index helpers", () => {
  it("clamps indexes into the list, including negatives", () => {
    expect(clampAdIndex(0, 0)).toBe(0);
    expect(clampAdIndex(4, 3)).toBe(1);
    expect(clampAdIndex(-1, 3)).toBe(2);
    expect(clampAdIndex(2, 3)).toBe(2);
  });

  it("wraps to the first item after the last one", () => {
    expect(getNextAdIndex(0, 3)).toBe(1);
    expect(getNextAdIndex(2, 3)).toBe(0);
    expect(getNextAdIndex(9, 3)).toBe(1);
    expect(getNextAdIndex(0, 0)).toBe(0);
  });
});

describe("getAdSlide", () => {
  it("returns no slide for an empty list", () => {
    expect(getAdSlide([], 0)).toEqual({ current: null, next: null });
  });

  it("returns the current item and the pre-rendered next item", () => {
    const items = [ad("one"), ad("two"), ad("three")];
    expect(getAdSlide(items, 0)).toEqual({ current: items[0], next: items[1] });
    expect(getAdSlide(items, 2)).toEqual({ current: items[2], next: items[0] });
  });

  it("does not duplicate a single item", () => {
    const items = [ad("only")];
    expect(getAdSlide(items, 5)).toEqual({ current: items[0], next: null });
  });
});

describe("normalizeAdItems", () => {
  it("trims content and drops blank entries without mutating the source", () => {
    const source = [ad("  first  "), ad("   "), ad("second", { color: "#ff0000" })];
    const result = normalizeAdItems(source);

    expect(result.map((item) => item.content)).toEqual(["first", "second"]);
    expect(result[1]).toEqual({ content: "second", color: "#ff0000", url: "" });
    expect(source[0].content).toBe("  first  ");
    expect(source).toHaveLength(3);
  });
});
