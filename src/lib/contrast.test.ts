import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  extractCssBlock,
  parseCssVariables,
  parseHexColor,
  relativeLuminance,
  resolveCssColor,
  resolveCssVariable,
  type Rgb,
} from "./contrast";

const css = readFileSync(
  fileURLToPath(new URL("../app/globals.css", import.meta.url)),
  "utf8",
);

const darkVariables = parseCssVariables(extractCssBlock(css, ":root {"));
const lightVariables = new Map([
  ...darkVariables,
  ...parseCssVariables(extractCssBlock(css, ':root[data-theme="light"] {')),
]);

function color(name: string, variables: Map<string, string>): Rgb {
  const value = resolveCssColor(name, variables);
  if (!value) throw new Error(`Token ${name} is not a resolvable hex colour`);
  return value;
}

function minimumContrast(
  token: string,
  backgrounds: string[],
  variables: Map<string, string>,
): number {
  const foreground = color(token, variables);
  return Math.min(
    ...backgrounds.map((background) =>
      contrastRatio(foreground, color(background, variables)),
    ),
  );
}

const SURFACES = [
  "--ds-surface-canvas",
  "--ds-surface-panel",
  "--ds-surface-card",
  "--ds-surface-elevated",
];

const INK_TOKENS = [
  "--ds-ink",
  "--ds-ink-soft",
  "--ds-ink-muted",
  "--ds-ink-faint",
];

describe("colour maths", () => {
  it("parses short and long hex colours", () => {
    expect(parseHexColor("#fff")).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseHexColor("#08080a")).toEqual({ r: 8, g: 8, b: 10 });
    expect(parseHexColor(" #F5F5F7 ")).toEqual({ r: 245, g: 245, b: 247 });
  });

  it("rejects unsupported colour formats", () => {
    expect(parseHexColor("rgb(0 0 0)")).toBeNull();
    expect(parseHexColor("color-mix(in srgb, #fff 50%, transparent)")).toBeNull();
    expect(parseHexColor("#12345")).toBeNull();
  });

  it("computes the WCAG black/white extremes", () => {
    const black = parseHexColor("#000000")!;
    const white = parseHexColor("#ffffff")!;
    expect(relativeLuminance(black)).toBe(0);
    expect(relativeLuminance(white)).toBeCloseTo(1, 5);
    expect(contrastRatio(black, white)).toBeCloseTo(21, 5);
    expect(contrastRatio(white, white)).toBeCloseTo(1, 5);
  });
});

describe("CSS token parsing", () => {
  it("extracts a brace-aware block", () => {
    const block = extractCssBlock(
      ":root { --a: #fff; --b: var(--a); } :root[data-theme=\"light\"] { --a: #000; }",
      ":root {",
    );
    expect(block).toContain("--a: #fff");
    expect(block).not.toContain("data-theme");
  });

  it("resolves var() indirection", () => {
    const variables = parseCssVariables("--a: #fff; --b: var(--a);");
    expect(resolveCssVariable("--b", variables)).toBe("#fff");
    expect(resolveCssVariable("--missing", variables)).toBeNull();
  });
});

describe.each([
  ["dark", darkVariables],
  ["light", lightVariables],
])("%s theme accessibility tokens", (_theme, variables) => {
  it.each(INK_TOKENS)("%s reaches 4.5:1 on every surface", (token) => {
    expect(minimumContrast(token, SURFACES, variables)).toBeGreaterThanOrEqual(4.5);
  });

  it("control borders reach the 3:1 non-text threshold", () => {
    expect(
      minimumContrast("--ds-line-control", SURFACES, variables),
    ).toBeGreaterThanOrEqual(3);
  });

  it("focus rings reach the 3:1 non-text threshold", () => {
    expect(
      minimumContrast("--ds-focus-ring", SURFACES, variables),
    ).toBeGreaterThanOrEqual(3);
  });

  it.each(["--ds-success", "--ds-warning", "--ds-danger"])(
    "%s status text reaches 4.5:1 on every surface",
    (token) => {
      expect(minimumContrast(token, SURFACES, variables)).toBeGreaterThanOrEqual(4.5);
    },
  );
});
