/**
 * WCAG 2.2 contrast helpers (REQ-202610-0497).
 *
 * Pure functions shared by the test suite so the design-token contrast
 * budget is verified in CI instead of relying on manual spot checks.
 */

export type Rgb = { r: number; g: number; b: number };

/** Parse `#rgb` / `#rrggbb` into 0–255 channels. Returns null for other formats. */
export function parseHexColor(value: string): Rgb | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return null;

  const hex = match[1];
  const expanded = hex.length === 3
    ? hex.split("").map((channel) => channel + channel).join("")
    : hex;

  return {
    r: Number.parseInt(expanded.slice(0, 2), 16),
    g: Number.parseInt(expanded.slice(2, 4), 16),
    b: Number.parseInt(expanded.slice(4, 6), 16),
  };
}

function linearize(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045
    ? value / 12.92
    : ((value + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance. */
export function relativeLuminance({ r, g, b }: Rgb): number {
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/** WCAG contrast ratio, from 1 (identical) to 21 (black/white). */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)]
    .sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Extract the first `selector { … }` block (brace-aware). */
export function extractCssBlock(css: string, selector: string): string {
  const selectorIndex = css.indexOf(selector);
  if (selectorIndex === -1) return "";

  const selectorBraceIndex = selector.lastIndexOf("{");
  const openIndex = selectorBraceIndex === -1
    ? css.indexOf("{", selectorIndex + selector.length)
    : selectorIndex + selectorBraceIndex;
  if (openIndex === -1 || css[openIndex] !== "{") return "";

  let depth = 0;
  for (let index = openIndex; index < css.length; index += 1) {
    const char = css[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(openIndex + 1, index);
    }
  }

  return "";
}

/** Collect `--token: value;` declarations from a CSS block. */
export function parseCssVariables(block: string): Map<string, string> {
  const variables = new Map<string, string>();
  const declaration = /(--[\w-]+)\s*:\s*([^;]+);/g;
  let match: RegExpExecArray | null;

  while ((match = declaration.exec(block)) !== null) {
    variables.set(match[1], match[2].trim());
  }

  return variables;
}

/** Resolve a token through `var(--other)` indirection. */
export function resolveCssVariable(
  name: string,
  variables: Map<string, string>,
  depth = 0,
): string | null {
  if (depth > 10) return null;

  const value = variables.get(name);
  if (!value) return null;

  const reference = /^var\(\s*(--[\w-]+)\s*\)$/.exec(value);
  if (reference) return resolveCssVariable(reference[1], variables, depth + 1);

  return value;
}

/** Resolve a token to RGB, or null when it is not a literal hex colour. */
export function resolveCssColor(
  name: string,
  variables: Map<string, string>,
): Rgb | null {
  const value = resolveCssVariable(name, variables);
  return value ? parseHexColor(value) : null;
}
