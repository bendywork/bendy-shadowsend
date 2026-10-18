import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  SCROLLBAR_SIZE_PX,
  getScrollAreaClassName,
  getScrollbarCompensation,
} from "@/lib/scroll";
import { createBodyScrollLock } from "@/lib/scroll-lock";

const globalsCss = readFileSync(
  fileURLToPath(new URL("../app/globals.css", import.meta.url)),
  "utf8",
);
const scrollCss = readFileSync(
  fileURLToPath(new URL("../app/scroll.css", import.meta.url)),
  "utf8",
);
const layoutSource = readFileSync(
  fileURLToPath(new URL("../app/layout.tsx", import.meta.url)),
  "utf8",
);

function cssRule(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
}

function lightThemeBlock(): string {
  return (
    globalsCss.match(/:root\[data-theme="light"\]\s*\{([\s\S]*?)\n\}/)?.[1] ??
    ""
  );
}

describe("scrollbar tokens", () => {
  it("mirrors the TS scrollbar size in globals.css", () => {
    expect(globalsCss).toMatch(
      new RegExp(`--ds-scrollbar-size:\\s*${SCROLLBAR_SIZE_PX}px;`),
    );
  });

  it("defines thumb, hover and track tokens for both themes", () => {
    expect(globalsCss).toContain("--ds-scrollbar-thumb:");
    expect(globalsCss).toContain("--ds-scrollbar-thumb-hover:");
    expect(globalsCss).toContain("--ds-scrollbar-track:");
    expect(globalsCss).toContain("--ds-scrollbar-corner:");

    const light = lightThemeBlock();
    expect(light).toContain("--ds-scrollbar-thumb: var(--ds-ink-muted);");
    expect(light).toContain("--ds-scrollbar-thumb-hover: var(--ds-ink-soft);");
  });
});

describe("scrollbar styling", () => {
  it("styles WebKit scrollbars from semantic tokens", () => {
    expect(cssRule(scrollCss, "::-webkit-scrollbar")).toMatch(
      /width:\s*var\(--ds-scrollbar-size\)/,
    );
    expect(cssRule(scrollCss, "::-webkit-scrollbar")).toMatch(
      /height:\s*var\(--ds-scrollbar-size\)/,
    );
    expect(cssRule(scrollCss, "::-webkit-scrollbar-thumb")).toContain(
      "var(--ds-scrollbar-thumb)",
    );
    expect(cssRule(scrollCss, "::-webkit-scrollbar-thumb:hover")).toContain(
      "var(--ds-scrollbar-thumb-hover)",
    );
    expect(cssRule(scrollCss, "::-webkit-scrollbar-track")).toContain(
      "var(--ds-scrollbar-track)",
    );
  });

  it("styles Firefox scrollbars on the root", () => {
    const html = cssRule(scrollCss, "html");
    expect(html).toMatch(/scrollbar-width:\s*thin/);
    expect(html).toMatch(
      /scrollbar-color:\s*var\(--ds-scrollbar-thumb\)\s+var\(--ds-scrollbar-track\)/,
    );
  });

  it("keeps the scrollbar stylesheet free of literal colors", () => {
    expect(scrollCss).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(scrollCss).not.toMatch(/\b(?:rgb|hsl)a?\(/);
  });
});

describe("scroll container contract", () => {
  it("defines the shared containment and gutter rules", () => {
    const base = cssRule(scrollCss, ".scroll-area");
    expect(base).toMatch(/min-width:\s*0/);
    expect(base).toMatch(/min-height:\s*0/);
    expect(base).toMatch(/overflow:\s*auto/);
    expect(base).toMatch(/overscroll-behavior:\s*contain/);
    expect(base).toMatch(/scrollbar-gutter:\s*stable/);
  });

  it("defines vertical, horizontal and two-axis variants", () => {
    const vertical = cssRule(scrollCss, ".scroll-area--y");
    expect(vertical).toMatch(/overflow-x:\s*hidden/);
    expect(vertical).toMatch(/overflow-y:\s*auto/);
    expect(vertical).toMatch(/overscroll-behavior-y:\s*contain/);

    const horizontal = cssRule(scrollCss, ".scroll-area--x");
    expect(horizontal).toMatch(/overflow-x:\s*auto/);
    expect(horizontal).toMatch(/overflow-y:\s*hidden/);
    expect(horizontal).toMatch(/overscroll-behavior-x:\s*contain/);

    expect(cssRule(scrollCss, ".scroll-area--both")).toMatch(
      /overflow:\s*auto/,
    );
  });

  it("gives keyboard-focused scroll regions an inset ring", () => {
    const focused = cssRule(scrollCss, ".scroll-area:focus-visible");
    expect(focused).toContain("var(--ds-focus-ring)");
    expect(focused).toMatch(/outline-offset:\s*-2px/);
  });

  it("is imported by the root layout", () => {
    expect(layoutSource).toContain('import "./scroll.css";');
  });

  it("builds class names for each axis", () => {
    expect(getScrollAreaClassName()).toBe("scroll-area scroll-area--y");
    expect(getScrollAreaClassName("y")).toBe("scroll-area scroll-area--y");
    expect(getScrollAreaClassName("x")).toBe("scroll-area scroll-area--x");
    expect(getScrollAreaClassName("both")).toBe(
      "scroll-area scroll-area--both",
    );
  });
});

describe("scrollbar compensation", () => {
  it("returns the removed classic scrollbar width", () => {
    expect(getScrollbarCompensation(1000, 992)).toBe(8);
    expect(getScrollbarCompensation(390, 390)).toBe(0);
  });

  it("never returns a negative or invalid value", () => {
    expect(getScrollbarCompensation(1000, 1010)).toBe(0);
    expect(getScrollbarCompensation(Number.NaN, 992)).toBe(0);
    expect(getScrollbarCompensation(1000, Number.NaN)).toBe(0);
  });
});

describe("body scroll lock", () => {
  function target(overflow = "", paddingRight = "", clientWidth = 1000) {
    return { style: { overflow, paddingRight }, clientWidth };
  }

  it("hides overflow and compensates the scrollbar on first lock", () => {
    const controller = createBodyScrollLock();
    const body = target("auto", "12px", 0);
    const root = target("", "", 992);

    const release = controller.lock(body, root, 1000);

    expect(body.style.overflow).toBe("hidden");
    expect(body.style.paddingRight).toBe("8px");
    expect(controller.activeCount).toBe(1);
    release();
  });

  it("reference-counts nested overlays and restores once", () => {
    const controller = createBodyScrollLock();
    const body = target("auto", "12px", 0);
    const root = target("", "", 992);

    const releaseOuter = controller.lock(body, root, 1000);
    const releaseInner = controller.lock(body, root, 1000);
    expect(controller.activeCount).toBe(2);

    releaseInner();
    expect(controller.activeCount).toBe(1);
    expect(body.style.overflow).toBe("hidden");

    releaseOuter();
    expect(controller.activeCount).toBe(0);
    expect(body.style.overflow).toBe("auto");
    expect(body.style.paddingRight).toBe("12px");
  });

  it("ignores duplicate releases", () => {
    const controller = createBodyScrollLock();
    const body = target();
    const release = controller.lock(body, target("", "", 1000), 1000);

    release();
    release();

    expect(controller.activeCount).toBe(0);
    expect(body.style.overflow).toBe("");
  });

  it("does not add padding when no scrollbar was removed", () => {
    const controller = createBodyScrollLock();
    const body = target();

    const release = controller.lock(body, target("", "", 1000), 1000);

    expect(body.style.paddingRight).toBe("");
    release();
  });
});
