import { describe, expect, it } from "vitest";
import {
  FOCUSABLE_SELECTOR,
  getFocusTrapIndex,
  getMenuFocusIndex,
  shouldSubmitComposer,
} from "@/lib/keyboard";

describe("shouldSubmitComposer", () => {
  it("sends on plain Enter when enter-to-send is enabled", () => {
    expect(shouldSubmitComposer({ key: "Enter" }, true)).toBe(true);
  });

  it("keeps plain Enter as a newline when enter-to-send is disabled", () => {
    expect(shouldSubmitComposer({ key: "Enter" }, false)).toBe(false);
  });

  it("always sends on Ctrl/Cmd+Enter, even with enter-to-send disabled", () => {
    expect(shouldSubmitComposer({ key: "Enter", ctrlKey: true }, false)).toBe(true);
    expect(shouldSubmitComposer({ key: "Enter", metaKey: true }, false)).toBe(true);
    expect(shouldSubmitComposer({ key: "Enter", ctrlKey: true }, true)).toBe(true);
  });

  it("keeps Shift+Enter and Alt+Enter as newlines", () => {
    expect(shouldSubmitComposer({ key: "Enter", shiftKey: true }, true)).toBe(false);
    expect(shouldSubmitComposer({ key: "Enter", altKey: true }, true)).toBe(false);
    expect(shouldSubmitComposer({ key: "Enter", shiftKey: true, ctrlKey: true }, true)).toBe(false);
  });

  it("never sends while an IME composition is active", () => {
    expect(shouldSubmitComposer({ key: "Enter", isComposing: true }, true)).toBe(false);
    expect(shouldSubmitComposer({ key: "Enter", keyCode: 229 }, true)).toBe(false);
  });

  it("ignores non-Enter keys", () => {
    expect(shouldSubmitComposer({ key: "a" }, true)).toBe(false);
    expect(shouldSubmitComposer({ key: "Escape" }, true)).toBe(false);
  });
});

describe("getMenuFocusIndex", () => {
  it("moves down and wraps from the last item", () => {
    expect(getMenuFocusIndex(-1, 3, "ArrowDown")).toBe(0);
    expect(getMenuFocusIndex(0, 3, "ArrowDown")).toBe(1);
    expect(getMenuFocusIndex(2, 3, "ArrowDown")).toBe(0);
  });

  it("moves up and wraps from the first item", () => {
    expect(getMenuFocusIndex(-1, 3, "ArrowUp")).toBe(2);
    expect(getMenuFocusIndex(0, 3, "ArrowUp")).toBe(2);
    expect(getMenuFocusIndex(2, 3, "ArrowUp")).toBe(1);
  });

  it("supports Home and End", () => {
    expect(getMenuFocusIndex(1, 3, "Home")).toBe(0);
    expect(getMenuFocusIndex(1, 3, "End")).toBe(2);
  });

  it("returns null for empty menus and unrelated keys", () => {
    expect(getMenuFocusIndex(0, 0, "ArrowDown")).toBeNull();
    expect(getMenuFocusIndex(0, 3, "Enter")).toBeNull();
  });
});

describe("getFocusTrapIndex", () => {
  it("wraps forward from the last item to the first", () => {
    expect(getFocusTrapIndex(2, 3, false)).toBe(0);
    expect(getFocusTrapIndex(0, 3, false)).toBe(1);
  });

  it("wraps backward from the first item to the last", () => {
    expect(getFocusTrapIndex(0, 3, true)).toBe(2);
    expect(getFocusTrapIndex(2, 3, true)).toBe(1);
  });

  it("enters the list from outside", () => {
    expect(getFocusTrapIndex(-1, 3, false)).toBe(0);
    expect(getFocusTrapIndex(-1, 3, true)).toBe(2);
  });

  it("returns -1 when there is nothing to focus", () => {
    expect(getFocusTrapIndex(0, 0, false)).toBe(-1);
  });
});

describe("FOCUSABLE_SELECTOR", () => {
  it("includes native controls but excludes programmatic-only tabindex", () => {
    expect(FOCUSABLE_SELECTOR).toContain("button:not([disabled])");
    expect(FOCUSABLE_SELECTOR).toContain("textarea:not([disabled])");
    expect(FOCUSABLE_SELECTOR).toContain("[tabindex]:not([tabindex='-1'])");
  });
});
