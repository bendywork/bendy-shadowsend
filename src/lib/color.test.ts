import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  normalizeHexColor,
  pickReadableForeground,
  relativeLuminance,
} from "@/lib/color";

describe("color helpers", () => {
  it("normalizes shorthand and full hex values", () => {
    expect(normalizeHexColor("#AbC")).toBe("#aabbcc");
    expect(normalizeHexColor(" #111113 ")).toBe("#111113");
    expect(normalizeHexColor("#12345")).toBeNull();
    expect(normalizeHexColor("white")).toBeNull();
  });

  it("computes WCAG relative luminance and contrast", () => {
    expect(relativeLuminance("#000000")).toBe(0);
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 5);
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    expect(contrastRatio("not-a-color", "#ffffff")).toBeNull();
  });

  it("picks the higher-contrast foreground per avatar background", () => {
    expect(pickReadableForeground("#a1a1aa")).toBe("#111113");
    expect(pickReadableForeground("#27272a")).toBe("#ffffff");
    expect(pickReadableForeground("invalid")).toBeNull();
  });
});
