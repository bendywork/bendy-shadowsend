import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MOTION_DURATIONS_MS,
  getScrollBehavior,
  prefersReducedMotion,
  type MotionEnvironment,
} from "@/lib/motion";

const globalsCss = readFileSync(
  new URL("../app/globals.css", import.meta.url),
  "utf8",
);

function environment(matches: boolean): MotionEnvironment {
  return { matchMedia: () => ({ matches }) };
}

describe("MOTION_DURATIONS_MS", () => {
  it("defines the shared duration scale in ascending order", () => {
    expect(MOTION_DURATIONS_MS).toEqual({
      instant: 0,
      fast: 120,
      base: 180,
      slow: 280,
      slower: 420,
    });

    const values = Object.values(MOTION_DURATIONS_MS);
    expect(values).toEqual([...values].sort((a, b) => a - b));
  });

  it.each(Object.entries(MOTION_DURATIONS_MS))(
    "keeps --ds-duration-%s in sync with the JS scale",
    (name, value) => {
      expect(globalsCss).toContain(`--ds-duration-${name}: ${value}ms;`);
    },
  );

  it("maps the duration scale to Tailwind's --transition-duration namespace", () => {
    for (const name of Object.keys(MOTION_DURATIONS_MS)) {
      expect(globalsCss).toContain(
        `--transition-duration-${name}: var(--ds-duration-${name});`,
      );
    }
  });

  it("declares the shared easing scale", () => {
    expect(globalsCss).toContain("--ds-ease-standard: cubic-bezier(0.2, 0, 0, 1);");
    expect(globalsCss).toContain("--ds-ease-out: cubic-bezier(0.16, 1, 0.3, 1);");
    expect(globalsCss).toContain("--ds-ease-in: cubic-bezier(0.4, 0, 1, 1);");
    expect(globalsCss).toContain("--ds-ease-linear: linear;");
  });

  it("routes every CSS transition/animation declaration through motion tokens", () => {
    const declarations = [
      ...globalsCss.matchAll(/(?:^|\n)\s*(transition|animation):\s*([^;]+);/g),
    ];

    expect(declarations.length).toBeGreaterThan(0);

    const untokenized = declarations
      .map(([, property, value]) => ({ property, value: value.trim() }))
      .filter(({ value }) => value !== "none")
      .filter(
        ({ value }) =>
          !value.includes("var(--ds-duration-") ||
          !value.includes("var(--ds-ease-"),
      );

    expect(untokenized).toEqual([]);
  });

  it("ships a global prefers-reduced-motion contract", () => {
    expect(globalsCss).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*--ds-duration-base: 0ms;[\s\S]*animation-duration: 0\.01ms !important;[\s\S]*transition-duration: 0\.01ms !important;/,
    );
  });
});

describe("prefersReducedMotion", () => {
  it("returns true when the media query matches", () => {
    expect(prefersReducedMotion(environment(true))).toBe(true);
  });

  it("returns false when the media query does not match", () => {
    expect(prefersReducedMotion(environment(false))).toBe(false);
  });

  it("returns false when matchMedia is unavailable", () => {
    expect(prefersReducedMotion(undefined)).toBe(false);
    expect(prefersReducedMotion({})).toBe(false);
  });

  it("returns false when matchMedia throws", () => {
    expect(
      prefersReducedMotion({
        matchMedia: () => {
          throw new Error("matchMedia unavailable");
        },
      }),
    ).toBe(false);
  });
});

describe("getScrollBehavior", () => {
  it("uses instant scrolling when reduced motion is requested", () => {
    expect(getScrollBehavior(environment(true))).toBe("auto");
  });

  it("uses smooth scrolling otherwise", () => {
    expect(getScrollBehavior(environment(false))).toBe("smooth");
  });
});
