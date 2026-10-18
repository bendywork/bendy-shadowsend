import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  EDGE_SWIPE_MAX_VERTICAL_PX,
  EDGE_SWIPE_TRIGGER_PX,
  EDGE_SWIPE_ZONE_PX,
  IMAGE_SWIPE_TRIGGER_PX,
  LONG_PRESS_DELAY_MS,
  LONG_PRESS_MOVE_TOLERANCE_PX,
  PINCH_MAX_SCALE,
  PINCH_MIN_SCALE,
  TOUCH_TARGET_MIN_PX,
  clampPanOffset,
  clampScale,
  containSize,
  distanceBetweenPoints,
  isDoubleTap,
  isLongPressGesture,
  meetsTouchTarget,
  midpointOfPoints,
  resolveEdgeSwipe,
  resolveImageSwipe,
  scaleFromPinch,
} from "./touch-gestures";

const viewport = { width: 390, height: 844 };

describe("resolveEdgeSwipe", () => {
  it("opens the left drawer when swiping right from the left edge", () => {
    expect(
      resolveEdgeSwipe({
        startX: 4,
        startY: 300,
        endX: 120,
        endY: 306,
        durationMs: 180,
        viewportWidth: viewport.width,
        openSide: null,
      }),
    ).toEqual({ action: "open", side: "left" });
  });

  it("opens the right drawer when swiping left from the right edge", () => {
    expect(
      resolveEdgeSwipe({
        startX: 386,
        startY: 300,
        endX: 260,
        endY: 296,
        durationMs: 180,
        viewportWidth: viewport.width,
        openSide: null,
      }),
    ).toEqual({ action: "open", side: "right" });
  });

  it("ignores a vertical scroll that starts near the edge", () => {
    expect(
      resolveEdgeSwipe({
        startX: 6,
        startY: 300,
        endX: 10,
        endY: 420,
        durationMs: 200,
        viewportWidth: viewport.width,
        openSide: null,
      }),
    ).toBeNull();
  });

  it("ignores a horizontal swipe that does not start in an edge zone", () => {
    expect(
      resolveEdgeSwipe({
        startX: 180,
        startY: 300,
        endX: 330,
        endY: 302,
        durationMs: 160,
        viewportWidth: viewport.width,
        openSide: null,
      }),
    ).toBeNull();
  });

  it("requires either enough distance or enough velocity", () => {
    expect(
      resolveEdgeSwipe({
        startX: 2,
        startY: 300,
        endX: 20,
        endY: 300,
        durationMs: 400,
        viewportWidth: viewport.width,
        openSide: null,
      }),
    ).toBeNull();
    expect(
      resolveEdgeSwipe({
        startX: 2,
        startY: 300,
        endX: 20,
        endY: 300,
        durationMs: 20,
        viewportWidth: viewport.width,
        openSide: null,
      }),
    ).toEqual({ action: "open", side: "left" });
  });

  it("closes an open left drawer with a leftward swipe", () => {
    expect(
      resolveEdgeSwipe({
        startX: 200,
        startY: 320,
        endX: 90,
        endY: 324,
        durationMs: 160,
        viewportWidth: viewport.width,
        openSide: "left",
      }),
    ).toEqual({ action: "close", side: "left" });
  });

  it("closes an open right drawer with a rightward swipe", () => {
    expect(
      resolveEdgeSwipe({
        startX: 200,
        startY: 320,
        endX: 320,
        endY: 318,
        durationMs: 160,
        viewportWidth: viewport.width,
        openSide: "right",
      }),
    ).toEqual({ action: "close", side: "right" });
  });

  it("ignores a swipe in the opposite direction of the open drawer", () => {
    expect(
      resolveEdgeSwipe({
        startX: 200,
        startY: 320,
        endX: 340,
        endY: 320,
        durationMs: 120,
        viewportWidth: viewport.width,
        openSide: "left",
      }),
    ).toBeNull();
  });

  it("ignores swipes with excessive vertical drift", () => {
    expect(
      resolveEdgeSwipe({
        startX: 4,
        startY: 200,
        endX: 140,
        endY: 200 + EDGE_SWIPE_MAX_VERTICAL_PX + 10,
        durationMs: 160,
        viewportWidth: viewport.width,
        openSide: null,
      }),
    ).toBeNull();
  });

  it("exposes stable gesture constants", () => {
    expect(EDGE_SWIPE_ZONE_PX).toBeGreaterThanOrEqual(16);
    expect(EDGE_SWIPE_TRIGGER_PX).toBeGreaterThanOrEqual(48);
    expect(TOUCH_TARGET_MIN_PX).toBe(44);
  });
});

describe("isLongPressGesture", () => {
  it("accepts a still finger held for the delay", () => {
    expect(
      isLongPressGesture({
        durationMs: LONG_PRESS_DELAY_MS,
        movementPx: 0,
      }),
    ).toBe(true);
  });

  it("rejects a press released too early", () => {
    expect(
      isLongPressGesture({
        durationMs: LONG_PRESS_DELAY_MS - 1,
        movementPx: 0,
      }),
    ).toBe(false);
  });

  it("rejects a press that moved beyond the tolerance", () => {
    expect(
      isLongPressGesture({
        durationMs: LONG_PRESS_DELAY_MS + 100,
        movementPx: LONG_PRESS_MOVE_TOLERANCE_PX + 1,
      }),
    ).toBe(false);
  });
});

describe("pinch zoom helpers", () => {
  it("measures the distance between two touches", () => {
    expect(distanceBetweenPoints({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it("computes the midpoint of two touches", () => {
    expect(midpointOfPoints({ x: 0, y: 0 }, { x: 10, y: 20 })).toEqual({
      x: 5,
      y: 10,
    });
  });

  it("clamps scale to the supported range", () => {
    expect(clampScale(0.2)).toBe(PINCH_MIN_SCALE);
    expect(clampScale(9)).toBe(PINCH_MAX_SCALE);
    expect(clampScale(2)).toBe(2);
  });

  it("derives the next scale from the pinch ratio", () => {
    expect(scaleFromPinch(100, 200, 1)).toBe(2);
    expect(scaleFromPinch(100, 50, 2)).toBe(1);
    expect(scaleFromPinch(0, 100, 1)).toBe(1);
  });

  it("computes contain-fit dimensions", () => {
    expect(containSize({ width: 400, height: 200 }, { width: 200, height: 200 })).toEqual({
      width: 200,
      height: 100,
    });
    expect(containSize({ width: 100, height: 200 }, { width: 200, height: 200 })).toEqual({
      width: 100,
      height: 200,
    });
  });

  it("clamps pan offsets to the scaled image bounds", () => {
    const clamped = clampPanOffset(
      { x: 400, y: -400 },
      2,
      { width: 200, height: 200 },
      { width: 100, height: 100 },
    );
    expect(clamped).toEqual({ x: 100, y: -100 });
  });

  it("allows panning within the scaled image bounds", () => {
    const clamped = clampPanOffset(
      { x: 60, y: -30 },
      2,
      { width: 200, height: 200 },
      { width: 200, height: 200 },
    );
    expect(clamped).toEqual({ x: 60, y: -30 });
  });
});

describe("image viewer gestures", () => {
  it("returns previous for a right swipe", () => {
    expect(resolveImageSwipe(IMAGE_SWIPE_TRIGGER_PX + 10, 0, 160)).toBe(-1);
  });

  it("returns next for a left swipe", () => {
    expect(resolveImageSwipe(-(IMAGE_SWIPE_TRIGGER_PX + 10), 0, 160)).toBe(1);
  });

  it("ignores a short slow drag", () => {
    expect(resolveImageSwipe(12, 2, 600)).toBe(0);
  });

  it("ignores a vertical drag", () => {
    expect(resolveImageSwipe(80, 140, 160)).toBe(0);
  });

  it("detects a double tap within the time window", () => {
    expect(isDoubleTap(1000, 1250)).toBe(true);
    expect(isDoubleTap(1000, 1600)).toBe(false);
    expect(isDoubleTap(null, 1600)).toBe(false);
  });
});

describe("touch target contract", () => {
  it("requires at least 44 by 44 CSS pixels", () => {
    expect(meetsTouchTarget({ width: 44, height: 44 })).toBe(true);
    expect(meetsTouchTarget({ width: 43, height: 44 })).toBe(false);
    expect(meetsTouchTarget({ width: 44, height: 43 })).toBe(false);
  });

  it("keeps the coarse-pointer CSS contract in sync", () => {
    const cssPath = fileURLToPath(new URL("../app/gestures.css", import.meta.url));
    const css = readFileSync(cssPath, "utf8");
    expect(css).toContain("@media (pointer: coarse)");
    expect(css).toContain(`min-width: ${TOUCH_TARGET_MIN_PX}px`);
    expect(css).toContain(`min-height: ${TOUCH_TARGET_MIN_PX}px`);
    expect(css).toContain("touch-action: none");
    expect(css).toContain("prefers-reduced-motion: reduce");
  });
});
