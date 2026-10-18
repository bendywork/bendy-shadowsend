import { describe, expect, it } from "vitest";
import {
  MENU_GAP,
  MENU_VIEWPORT_PADDING,
  computeMenuPosition,
} from "./menu";

const viewport = { width: 1200, height: 800 };
const menu = { width: 200, height: 120 };

describe("computeMenuPosition", () => {
  it("opens below the anchor and aligns the right edge", () => {
    const result = computeMenuPosition(
      { top: 100, left: 300, width: 40, height: 32 },
      menu,
      viewport,
      "end",
    );

    expect(result).toEqual({
      top: 100 + 32 + MENU_GAP,
      left: 300 + 40 - menu.width,
      placement: "bottom",
    });
  });

  it("aligns the left edge when align is start", () => {
    const result = computeMenuPosition(
      { top: 100, left: 300, width: 40, height: 32 },
      menu,
      viewport,
      "start",
    );

    expect(result.left).toBe(300);
  });

  it("flips above the anchor when there is not enough room below", () => {
    const result = computeMenuPosition(
      { top: 700, left: 300, width: 40, height: 32 },
      menu,
      viewport,
      "end",
    );

    expect(result.placement).toBe("top");
    expect(result.top).toBe(700 - MENU_GAP - menu.height);
  });

  it("clamps the menu inside the right viewport edge", () => {
    const result = computeMenuPosition(
      { top: 100, left: 1180, width: 40, height: 32 },
      menu,
      viewport,
      "end",
    );

    expect(result.left).toBe(viewport.width - menu.width - MENU_VIEWPORT_PADDING);
  });

  it("clamps the menu inside the left viewport edge", () => {
    const result = computeMenuPosition(
      { top: 100, left: -20, width: 40, height: 32 },
      menu,
      viewport,
      "start",
    );

    expect(result.left).toBe(MENU_VIEWPORT_PADDING);
  });

  it("clamps vertically when the menu is taller than the viewport", () => {
    const result = computeMenuPosition(
      { top: 400, left: 300, width: 40, height: 32 },
      { width: 200, height: 900 },
      viewport,
      "end",
    );

    expect(result.top).toBe(MENU_VIEWPORT_PADDING);
  });

  it("keeps the bottom padding when neither side has enough room", () => {
    const result = computeMenuPosition(
      { top: 740, left: 300, width: 40, height: 32 },
      menu,
      { width: 1200, height: 700 },
      "end",
    );

    expect(result.top).toBe(
      700 - menu.height - MENU_VIEWPORT_PADDING,
    );
  });
});
