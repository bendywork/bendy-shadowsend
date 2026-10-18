import { describe, expect, it } from "vitest";
import {
  clampImageIndex,
  clampPanOffset,
  clampZoom,
  getImageViewerAction,
  getPanLimit,
  getZoomPercent,
  stepImageIndex,
  stepZoom,
} from "./image-viewer";

describe("image viewer logic", () => {
  it("clamps indexes into the image list", () => {
    expect(clampImageIndex(-3, 4)).toBe(0);
    expect(clampImageIndex(2.9, 4)).toBe(2);
    expect(clampImageIndex(9, 4)).toBe(3);
    expect(clampImageIndex(1, 0)).toBe(0);
  });

  it("wraps previous/next navigation", () => {
    expect(stepImageIndex(0, 3, -1)).toBe(2);
    expect(stepImageIndex(2, 3, 1)).toBe(0);
    expect(stepImageIndex(1, 3, 1)).toBe(2);
    expect(stepImageIndex(0, 0, 1)).toBe(0);
  });

  it("clamps zoom between fit and 4x", () => {
    expect(clampZoom(0.2)).toBe(1);
    expect(clampZoom(9)).toBe(4);
    expect(clampZoom(Number.NaN)).toBe(1);
    expect(stepZoom(1, 0.25)).toBe(1.25);
    expect(stepZoom(4, 1)).toBe(4);
  });

  it("reports a rounded zoom percentage", () => {
    expect(getZoomPercent(1)).toBe(100);
    expect(getZoomPercent(1.5)).toBe(150);
    expect(getZoomPercent(2.34)).toBe(234);
  });

  it("maps keyboard shortcuts", () => {
    expect(getImageViewerAction("Escape", true)).toBe("close");
    expect(getImageViewerAction("ArrowLeft", true)).toBe("previous");
    expect(getImageViewerAction("ArrowRight", true)).toBe("next");
    expect(getImageViewerAction("Home", true)).toBe("first");
    expect(getImageViewerAction("End", true)).toBe("last");
    expect(getImageViewerAction("+", false)).toBe("zoom-in");
    expect(getImageViewerAction("=", false)).toBe("zoom-in");
    expect(getImageViewerAction("-", false)).toBe("zoom-out");
    expect(getImageViewerAction("0", false)).toBe("reset");
    expect(getImageViewerAction("ArrowLeft", false)).toBeNull();
    expect(getImageViewerAction("a", true)).toBeNull();
  });

  it("computes pan limits from stage size and zoom", () => {
    expect(getPanLimit(1000, 1)).toBe(0);
    expect(getPanLimit(1000, 2)).toBe(500);
    expect(getPanLimit(800, 1.5)).toBe(200);
    expect(getPanLimit(-10, 2)).toBe(0);
  });

  it("clamps pan offsets symmetrically", () => {
    expect(clampPanOffset(120, 100)).toBe(100);
    expect(clampPanOffset(-120, 100)).toBe(-100);
    expect(clampPanOffset(50, 0)).toBe(0);
    expect(clampPanOffset(Number.NaN, 100)).toBe(0);
  });
});
