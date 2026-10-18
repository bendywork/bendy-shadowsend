#!/usr/bin/env node
/**
 * Accent audit for the monochrome design system (dc-02).
 *
 * The product keeps colour exclusively for semantic status feedback. This
 * script fails CI when source files reintroduce:
 *   - legacy system-blue accents (#0a84ff / #0071e3)
 *   - default Tailwind palette utilities (bg-blue-500, text-red-400, ...)
 *   - hard-coded colour literals outside the token / avatar palette files
 *   - inline text colours on React elements
 *   - non-neutral hex values inside globals.css or avatar-color.ts
 *   - `!important` overrides in globals.css
 *   - non-inverted primary action tokens or insufficient contrast
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const GLOBALS_CSS_REL = "src/app/globals.css";
const AVATAR_COLOR_REL = "src/lib/avatar-color.ts";

const LEGACY_ACCENT_RE =
  /#(?:0a84ff|0071e3)\b|rgb\(\s*(?:10\s*[, ]\s*132\s*[, ]\s*255|0\s*[, ]\s*113\s*[, ]\s*227)\s*\)/gi;
const TAILWIND_PALETTE_RE =
  /\b(?:bg|text|border|ring|outline|from|via|to|fill|stroke|decoration|divide|shadow|accent|caret)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-\d{2,3}\b/g;
const COLOR_LITERAL_RE = /#[0-9a-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|oklch|lab|lch)\([^)]*\)/gi;
const INLINE_TEXT_COLOR_RE = /style=\{\{[^}]*\bcolor\s*:/g;

/** Semantic status colours are the only non-neutral values allowed. */
const STATUS_HEX = new Set([
  "#30d158",
  "#ffd60a",
  "#ff453a",
  "#1a7f37",
  "#9a6700",
  "#d1242f",
]);
const STATUS_RGB = [
  [48, 209, 88],
  [255, 214, 10],
  [255, 69, 58],
  [26, 127, 55],
  [154, 103, 0],
  [209, 36, 47],
];
const NEUTRAL_CHANNEL_TOLERANCE = 24;

function normalizePath(filePath) {
  return filePath.split(sep).join("/");
}

function lineOf(source, index) {
  return source.slice(0, index).split("\n").length;
}

export function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

export function expandHex(value) {
  const hex = value.toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(hex)) {
    return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  return hex;
}

function parseHex(value) {
  if (!/^#[0-9a-f]{6}$/.test(value)) {
    return null;
  }
  return [
    Number.parseInt(value.slice(1, 3), 16),
    Number.parseInt(value.slice(3, 5), 16),
    Number.parseInt(value.slice(5, 7), 16),
  ];
}

export function isNeutralColorLiteral(value) {
  let rgb = null;
  if (value.startsWith("#")) {
    rgb = parseHex(expandHex(value));
  } else if (/^rgba?\(/i.test(value)) {
    rgb = rgbTriple(value);
  }
  if (!rgb) {
    return false;
  }
  return Math.max(...rgb) - Math.min(...rgb) <= NEUTRAL_CHANNEL_TOLERANCE;
}

function rgbTriple(value) {
  const match = value.match(/(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/);
  if (!match) {
    return null;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function isStatusColorLiteral(value) {
  if (value.startsWith("#")) {
    return STATUS_HEX.has(expandHex(value));
  }
  const rgb = rgbTriple(value);
  if (!rgb) {
    return false;
  }
  return STATUS_RGB.some(
    (status) =>
      status[0] === rgb[0] && status[1] === rgb[1] && status[2] === rgb[2],
  );
}

export function isAllowedTokenColor(value) {
  return isNeutralColorLiteral(value) || isStatusColorLiteral(value);
}

export function extractBlock(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`, "m"));
  return match ? match[1] : null;
}

export function extractToken(block, token) {
  if (!block) {
    return null;
  }
  const match = block.match(new RegExp(`${token}\\s*:\\s*([^;]+);`));
  return match ? match[1].trim() : null;
}

export function relativeLuminance(hexValue) {
  const hex = expandHex(hexValue);
  const rgb = parseHex(hex);
  if (!rgb) {
    return null;
  }
  const [red, green, blue] = rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.03928
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function contrastRatio(foreground, background) {
  const fg = relativeLuminance(foreground);
  const bg = relativeLuminance(background);
  if (fg === null || bg === null) {
    return null;
  }
  const lighter = Math.max(fg, bg);
  const darker = Math.min(fg, bg);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Primary buttons must invert: dark theme uses a light surface with dark ink,
 * light theme uses a dark surface with light ink, and both keep WCAG AA.
 */
export function checkPrimaryButtonInversion(css) {
  const problems = [];
  const darkBlock = extractBlock(css, ":root");
  const lightBlock = extractBlock(css, ':root[data-theme="light"]');
  const themes = [
    { name: "dark", block: darkBlock, expectLightSurface: true },
    { name: "light", block: lightBlock, expectLightSurface: false },
  ];

  for (const theme of themes) {
    const background = extractToken(theme.block, "--ds-action-bg");
    const foreground = extractToken(theme.block, "--ds-action-fg");
    if (!background || !foreground) {
      problems.push({
        rule: "primary-inversion",
        message: `${theme.name} theme is missing --ds-action-bg / --ds-action-fg`,
      });
      continue;
    }
    const bgLuminance = relativeLuminance(background);
    const fgLuminance = relativeLuminance(foreground);
    if (bgLuminance === null || fgLuminance === null) {
      problems.push({
        rule: "primary-inversion",
        message: `${theme.name} theme action tokens must be hex colours`,
      });
      continue;
    }
    if (theme.expectLightSurface && bgLuminance <= fgLuminance) {
      problems.push({
        rule: "primary-inversion",
        message: "dark theme primary button is not inverted (surface must be lighter than ink)",
      });
    }
    if (!theme.expectLightSurface && bgLuminance >= fgLuminance) {
      problems.push({
        rule: "primary-inversion",
        message: "light theme primary button is not inverted (surface must be darker than ink)",
      });
    }
    const ratio = contrastRatio(background, foreground);
    if (ratio !== null && ratio < 4.5) {
      problems.push({
        rule: "primary-contrast",
        message: `${theme.name} theme primary button contrast is ${ratio.toFixed(2)}:1 (needs 4.5:1)`,
      });
    }
  }

  return problems;
}

function pushMatches(violations, source, file, rule, regex, message) {
  for (const match of source.matchAll(regex)) {
    violations.push({
      file,
      line: lineOf(source, match.index ?? 0),
      rule,
      match: match[0],
      message,
    });
  }
}

/**
 * Scan one source string. `filePath` may be absolute or repo-relative.
 */
export function scanSource(source, filePath, root = ROOT) {
  const absolute = filePath.startsWith("/") ? filePath : join(root, filePath);
  const file = normalizePath(relative(root, absolute));
  const text = stripComments(source);
  const violations = [];

  pushMatches(
    violations,
    text,
    file,
    "legacy-accent",
    LEGACY_ACCENT_RE,
    "legacy system-blue accent is banned (dc-02)",
  );
  pushMatches(
    violations,
    text,
    file,
    "tailwind-palette",
    TAILWIND_PALETTE_RE,
    "default Tailwind palette utilities are banned; use design tokens",
  );
  pushMatches(
    violations,
    text,
    file,
    "inline-text-color",
    INLINE_TEXT_COLOR_RE,
    "inline text colours are banned; use ink tokens",
  );

  for (const match of text.matchAll(COLOR_LITERAL_RE)) {
    const literal = match[0];
    const allowedFile = file === GLOBALS_CSS_REL || file === AVATAR_COLOR_REL;
    if (allowedFile && isAllowedTokenColor(literal)) {
      continue;
    }
    violations.push({
      file,
      line: lineOf(text, match.index ?? 0),
      rule: "hardcoded-color",
      match: literal,
      message: allowedFile
        ? "only neutral or semantic status colours may be hard-coded here"
        : "hard-coded colours are banned outside globals.css / avatar-color.ts",
    });
  }

  return violations;
}

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(full));
    } else if (/\.(?:ts|tsx|css)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

export function scanRepository(root = ROOT) {
  const srcDir = join(root, "src");
  const files = walk(srcDir).filter(
    (file) => !/\.test\.(?:ts|tsx)$/.test(file),
  );
  const violations = [];

  for (const file of files) {
    violations.push(...scanSource(readFileSync(file, "utf8"), file, root));
  }

  const globalsPath = join(root, GLOBALS_CSS_REL);
  const globalsCss = readFileSync(globalsPath, "utf8");
  const strippedCss = stripComments(globalsCss);

  if (/!important/.test(strippedCss)) {
    violations.push({
      file: GLOBALS_CSS_REL,
      line: lineOf(strippedCss, strippedCss.indexOf("!important")),
      rule: "important-override",
      match: "!important",
      message: "!important is banned; use token order / specificity instead",
    });
  }

  for (const problem of checkPrimaryButtonInversion(strippedCss)) {
    violations.push({ file: GLOBALS_CSS_REL, line: 1, match: "", ...problem });
  }

  return { filesChecked: files.length, violations };
}

const isMain =
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMain) {
  const { filesChecked, violations } = scanRepository();
  if (violations.length > 0) {
    for (const violation of violations) {
      console.error(
        `${violation.file}:${violation.line} [${violation.rule}] ${violation.message}${
          violation.match ? ` — ${violation.match}` : ""
        }`,
      );
    }
    console.error(`\nAccent audit failed: ${violations.length} violation(s).`);
    process.exitCode = 1;
  } else {
    console.log(`Accent audit passed: ${filesChecked} files checked, 0 violations.`);
  }
}
