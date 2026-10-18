import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  BREAKPOINTS,
  getDesktopGridTemplate,
  getLayoutMode,
  getPanelSide,
  isDrawerAt,
  resolveRoomLayout,
} from "@/lib/responsive";

const globalsCss = readFileSync(
  fileURLToPath(new URL("../app/globals.css", import.meta.url)),
  "utf8",
);
const responsiveCss = readFileSync(
  fileURLToPath(new URL("../app/responsive.css", import.meta.url)),
  "utf8",
);

describe("breakpoint contract", () => {
  it("exposes the standard four-step scale in px", () => {
    expect(BREAKPOINTS).toEqual({ sm: 640, md: 768, lg: 1024, xl: 1280 });
  });

  it("mirrors the scale as rem tokens in globals.css", () => {
    for (const [name, px] of Object.entries(BREAKPOINTS)) {
      const match = globalsCss.match(
        new RegExp(`--breakpoint-${name}:\\s*([\\d.]+)rem;`),
      );
      expect(match, `missing --breakpoint-${name}`).not.toBeNull();
      expect(Number(match?.[1]) * 16).toBe(px);
    }
  });
});

describe("getLayoutMode", () => {
  it("maps phone widths to mobile", () => {
    expect(getLayoutMode(320)).toBe("mobile");
    expect(getLayoutMode(767)).toBe("mobile");
  });

  it("maps 768–1279px to tablet", () => {
    expect(getLayoutMode(768)).toBe("tablet");
    expect(getLayoutMode(1024)).toBe("tablet");
    expect(getLayoutMode(1279)).toBe("tablet");
  });

  it("maps >= 1280px to desktop", () => {
    expect(getLayoutMode(1280)).toBe("desktop");
    expect(getLayoutMode(1920)).toBe("desktop");
  });

  it("treats invalid widths as mobile", () => {
    expect(getLayoutMode(Number.NaN)).toBe("mobile");
    expect(getLayoutMode(-1)).toBe("mobile");
  });
});

describe("resolveRoomLayout", () => {
  it("uses a single column with two drawers on mobile", () => {
    expect(resolveRoomLayout(390)).toMatchObject({
      mode: "mobile",
      columns: 1,
      rooms: "drawer",
      members: "drawer",
      gridTemplate: "minmax(0, 1fr)",
    });
  });

  it("uses two columns and a members drawer on tablet", () => {
    expect(resolveRoomLayout(900)).toMatchObject({
      mode: "tablet",
      columns: 2,
      rooms: "column",
      members: "drawer",
      gridTemplate: "280px minmax(0, 1fr)",
    });
  });

  it("uses three columns on desktop", () => {
    expect(resolveRoomLayout(1440)).toMatchObject({
      mode: "desktop",
      columns: 3,
      rooms: "column",
      members: "column",
    });
  });
});

describe("getDesktopGridTemplate", () => {
  it("covers all sidebar visibility combinations", () => {
    expect(getDesktopGridTemplate(true, true)).toBe(
      "290px minmax(0, 1fr) 290px",
    );
    expect(getDesktopGridTemplate(true, false)).toBe("290px minmax(0, 1fr)");
    expect(getDesktopGridTemplate(false, true)).toBe("minmax(0, 1fr) 290px");
    expect(getDesktopGridTemplate(false, false)).toBe("minmax(0, 1fr)");
  });
});

describe("panel placement", () => {
  it("keeps rooms on the left and members on the right", () => {
    expect(getPanelSide("rooms")).toBe("left");
    expect(getPanelSide("members")).toBe("right");
  });

  it("reports which panels are drawers per mode", () => {
    expect(isDrawerAt("mobile", "rooms")).toBe(true);
    expect(isDrawerAt("tablet", "rooms")).toBe(false);
    expect(isDrawerAt("desktop", "rooms")).toBe(false);
    expect(isDrawerAt("mobile", "members")).toBe(true);
    expect(isDrawerAt("tablet", "members")).toBe(true);
    expect(isDrawerAt("desktop", "members")).toBe(false);
  });
});

describe("responsive.css contract", () => {
  it("defines the mobile, tablet and desktop grid", () => {
    expect(responsiveCss).toContain("@media (max-width: 767.98px)");
    expect(responsiveCss).toContain(
      "@media (min-width: 768px) and (max-width: 1279.98px)",
    );
    expect(responsiveCss).toContain("@media (min-width: 1280px)");
    expect(responsiveCss).toContain(
      "grid-template-columns: 280px minmax(0, 1fr)",
    );
    expect(responsiveCss).toContain(
      "grid-template-columns: var(--room-desktop-grid, 290px minmax(0, 1fr) 290px)",
    );
  });

  it("drives drawer visibility from data-open", () => {
    expect(responsiveCss).toContain('.room-panel--rooms[data-open="true"]');
    expect(responsiveCss).toContain('.room-panel--members[data-open="true"]');
  });

  it("keeps touch targets at 44px and respects reduced motion", () => {
    expect(responsiveCss).toContain("@media (pointer: coarse)");
    expect(responsiveCss).toContain("min-height: 44px");
    expect(responsiveCss).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("uses semantic tokens instead of hardcoded colors", () => {
    expect(responsiveCss).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(responsiveCss).not.toMatch(/\b(?:rgb|hsl)a?\(/);
  });
});
