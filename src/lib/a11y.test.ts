import { describe, expect, it } from "vitest";
import { buildDescribedBy, resolveMenuTarget, resolveTabTarget } from "./a11y";

describe("resolveTabTarget", () => {
  it("moves forward and wraps at the end", () => {
    expect(resolveTabTarget(3, 0, false)).toBe(1);
    expect(resolveTabTarget(3, 1, false)).toBe(2);
    expect(resolveTabTarget(3, 2, false)).toBe(0);
  });

  it("moves backward and wraps at the start", () => {
    expect(resolveTabTarget(3, 2, true)).toBe(1);
    expect(resolveTabTarget(3, 0, true)).toBe(2);
  });

  it("enters the trap from outside focus", () => {
    expect(resolveTabTarget(3, -1, false)).toBe(0);
    expect(resolveTabTarget(3, -1, true)).toBe(2);
  });

  it("handles an empty dialog", () => {
    expect(resolveTabTarget(0, 0, false)).toBe(-1);
    expect(resolveTabTarget(-1, 0, true)).toBe(-1);
  });
});

describe("resolveMenuTarget", () => {
  it("cycles through menu items", () => {
    expect(resolveMenuTarget(3, 2, "ArrowDown")).toBe(0);
    expect(resolveMenuTarget(3, 0, "ArrowUp")).toBe(2);
    expect(resolveMenuTarget(3, -1, "ArrowDown")).toBe(0);
    expect(resolveMenuTarget(3, -1, "ArrowUp")).toBe(2);
  });

  it("supports Home and End", () => {
    expect(resolveMenuTarget(4, 2, "Home")).toBe(0);
    expect(resolveMenuTarget(4, 1, "End")).toBe(3);
  });

  it("ignores unrelated keys and empty menus", () => {
    expect(resolveMenuTarget(3, 1, "Enter")).toBeNull();
    expect(resolveMenuTarget(0, -1, "ArrowDown")).toBeNull();
  });
});

describe("buildDescribedBy", () => {
  it("joins present ids and drops empty ones", () => {
    expect(buildDescribedBy("hint", undefined, "error", false)).toBe("hint error");
    expect(buildDescribedBy(undefined, false)).toBeUndefined();
  });
});
