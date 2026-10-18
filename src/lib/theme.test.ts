import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contrastRatio, normalizeHexColor } from "@/lib/color";

const rawCss = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const css = rawCss.replace(/\/\*[\s\S]*?\*\//g, "");

type TokenMap = Record<string, string>;
type Rgb = { r: number; g: number; b: number; a: number };

function block(selector: RegExp): string {
  const match = css.match(selector);
  if (!match) throw new Error(`Missing CSS block: ${selector}`);
  return match[1];
}

function parseTokens(source: string): TokenMap {
  const tokens: TokenMap = {};
  for (const match of source.matchAll(/(--ds-[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    tokens[match[1]] = match[2].trim();
  }
  return tokens;
}

function resolveToken(tokens: TokenMap, name: string, seen = new Set<string>()): string | null {
  if (seen.has(name)) return null;
  seen.add(name);
  const value = tokens[name];
  if (!value) return null;
  const alias = value.match(/^var\((--ds-[a-z0-9-]+)\)$/);
  return alias ? resolveToken(tokens, alias[1], seen) : normalizeHexColor(value);
}

function parseRgb(value: string | undefined): Rgb | null {
  if (!value) return null;
  const match = value.match(/^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*\/\s*([\d.]+)\s*\)$/);
  if (!match) return null;
  return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]), a: Number(match[4]) };
}

function parseSoftColor(value: string | undefined): Rgb | null {
  const rgb = parseRgb(value);
  if (rgb) return rgb;
  if (!value) return null;
  const mix = value.match(/^color-mix\(in srgb, (#[0-9a-f]{3,6}) (\d+(?:\.\d+)?)%, transparent\)$/i);
  if (!mix) return null;
  const hex = normalizeHexColor(mix[1]);
  if (!hex) return null;
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
    a: Number(mix[2]) / 100,
  };
}

function blendRgbOver(rgb: Rgb, background: string): string {
  const hex = normalizeHexColor(background);
  if (!hex) throw new Error(`Invalid background: ${background}`);
  const channels = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
  const blended = [rgb.r, rgb.g, rgb.b].map((channel, index) =>
    Math.round(channel * rgb.a + channels[index] * (1 - rgb.a)),
  );
  return `#${blended.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

const rootTokens = parseTokens(block(/:root\s*\{([^}]*)\}/));
const lightOverrides = parseTokens(block(/:root\[data-theme="light"\]\s*\{([^}]*)\}/));
const themes: Record<"dark" | "light", TokenMap> = {
  dark: rootTokens,
  light: { ...rootTokens, ...lightOverrides },
};

const TEXT_TOKENS = ["--ds-ink", "--ds-ink-soft", "--ds-ink-muted", "--ds-ink-faint"];
const TEXT_SURFACES = ["--ds-surface-canvas", "--ds-surface-panel", "--ds-surface-card"];
const BOUNDARY_SURFACES = ["--ds-surface-canvas", "--ds-surface-panel", "--ds-surface-card"];
const STATUS_TOKENS = ["--ds-success", "--ds-warning", "--ds-danger"];

describe("dual-theme token contract", () => {
  it("keeps the stylesheet free of !important overrides", () => {
    expect(css).not.toMatch(/!important/);
  });

  it("only swaps tokens in the light theme block", () => {
    const lightBlock = block(/:root\[data-theme="light"\]\s*\{([^}]*)\}/);
    expect(lightBlock).not.toMatch(/\.(?:bg|text|border)-/);
    expect(lightBlock).not.toMatch(/--color-/);
  });

  it("keeps text tokens at 4.5:1 on canvas, panel and card in both themes", () => {
    for (const theme of ["dark", "light"] as const) {
      for (const text of TEXT_TOKENS) {
        for (const surface of TEXT_SURFACES) {
          const foreground = resolveToken(themes[theme], text);
          const background = resolveToken(themes[theme], surface);
          expect(foreground, `${theme} ${text}`).not.toBeNull();
          expect(background, `${theme} ${surface}`).not.toBeNull();
          expect(contrastRatio(foreground as string, background as string)).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it("does not fade placeholder text below its token contrast", () => {
    const placeholder = css.match(/\.field::placeholder\s*\{([^}]*)\}/);
    expect(placeholder).not.toBeNull();
    const opacity = placeholder?.[1].match(/opacity:\s*([\d.]+)/);
    if (opacity) expect(Number(opacity[1])).toBe(1);
  });

  it("keeps control boundaries at 3:1 against every base surface", () => {
    for (const theme of ["dark", "light"] as const) {
      for (const surface of BOUNDARY_SURFACES) {
        const boundary = resolveToken(themes[theme], "--ds-line-control");
        const background = resolveToken(themes[theme], surface);
        expect(contrastRatio(boundary as string, background as string)).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("keeps status text at 4.5:1 on its soft background", () => {
    for (const theme of ["dark", "light"] as const) {
      for (const status of STATUS_TOKENS) {
        const foreground = resolveToken(themes[theme], status);
        const soft = parseSoftColor(themes[theme][`${status}-soft`]);
        const canvas = resolveToken(themes[theme], "--ds-surface-canvas");
        expect(soft, `${theme} ${status}-soft`).not.toBeNull();
        const background = blendRgbOver(soft as Rgb, canvas as string);
        expect(contrastRatio(foreground as string, background)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("keeps the light focus ring visible against the canvas", () => {
    const ring = parseRgb(lightOverrides["--ds-focus-ring"]);
    const canvas = resolveToken(themes.light, "--ds-surface-canvas");
    expect(ring).not.toBeNull();
    const blended = blendRgbOver(ring as Rgb, canvas as string);
    expect(contrastRatio(blended, canvas as string)).toBeGreaterThanOrEqual(3);
  });

  it("keeps QR colors theme-invariant and scannable", () => {
    for (const token of ["--ds-qr-dark", "--ds-qr-light", "--ds-qr-surface", "--ds-qr-border"]) {
      expect(lightOverrides[token], token).toBeUndefined();
    }
    const dark = resolveToken(themes.light, "--ds-qr-dark");
    const light = resolveToken(themes.light, "--ds-qr-light");
    expect(contrastRatio(dark as string, light as string)).toBeGreaterThanOrEqual(7);
  });
});
