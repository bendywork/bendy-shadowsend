#!/usr/bin/env node
/**
 * 黑白灰视觉纪律静态审计（dc-02 / REQ-202610-0509）。
 *
 * 规则：
 *  - 组件源码不得出现 Tailwind 彩色工具类、硬编码彩色 hex/rgb。
 *  - 全仓不得出现旧系统蓝强调色。
 *  - globals.css 不得出现 !important；浅色主题块只允许 --ds-*。
 *  - 主按钮令牌必须反色且对比度 >= 4.5:1；二维码 >= 7:1。
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const LEGACY_ACCENTS = [
  /#0a84ff\b/gi,
  /#0071e3\b/gi,
  /rgb\(\s*10\s*,\s*132\s*,\s*255\s*\)/gi,
  /rgb\(\s*0\s*,\s*113\s*,\s*227\s*\)/gi,
  /rgb\(\s*10\s+132\s+255(?:\s*\/[^)]*)?\)/gi,
  /rgb\(\s*0\s+113\s+227(?:\s*\/[^)]*)?\)/gi,
];

const COLOR_UTILITY_RE =
  /\b(?:bg|text|border|ring|from|to|via|divide|placeholder|fill|stroke|outline|shadow|accent|caret|decoration)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(?:-\d{2,3})?\b/g;

const NON_TOKEN_GRAY_RE =
  /\b(?:bg|text|border|ring|from|to|via|divide|placeholder|fill|stroke)-(?:white|black)\b/g;

const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g;
const RGB_RE = /\brgba?\(\s*([^)]+)\)/gi;

export function lineAt(text, index) {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i += 1) {
    if (text[i] === "\n") line += 1;
  }
  return line;
}

export function stripCssComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, (comment) =>
    comment.replace(/[^\n]/g, " "),
  );
}

export function extractBlock(css, selector) {
  const start = css.indexOf(selector);
  if (start < 0) return null;
  const open = css.indexOf("{", start + selector.length);
  if (open < 0) return null;
  let depth = 0;
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === "{") depth += 1;
    if (css[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        return {
          start: open + 1,
          end: index,
          content: css.slice(open + 1, index),
        };
      }
    }
  }
  return null;
}

export function parseDeclarations(blockContent) {
  const map = new Map();
  for (const match of blockContent.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    map.set(match[1], match[2].trim());
  }
  return map;
}

export function parseColor(value) {
  if (typeof value !== "string") return null;
  const text = value.trim();

  const hex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(text);
  if (hex) {
    let digits = hex[1];
    if (digits.length === 3) {
      digits = digits
        .split("")
        .map((char) => `${char}${char}`)
        .join("");
    }
    return {
      r: Number.parseInt(digits.slice(0, 2), 16),
      g: Number.parseInt(digits.slice(2, 4), 16),
      b: Number.parseInt(digits.slice(4, 6), 16),
    };
  }

  const rgb = /^rgba?\(\s*([^)]+)\)$/.exec(text);
  if (!rgb) return null;
  const parts = rgb[1]
    .replace("/", " ")
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((part) => Number.parseFloat(part));
  if (parts.length < 3 || parts.slice(0, 3).some((part) => !Number.isFinite(part))) {
    return null;
  }
  return { r: parts[0], g: parts[1], b: parts[2] };
}

export function relativeLuminance(color) {
  const channel = (value) => {
    const normalized = value / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
}

export function contrastRatio(first, second) {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

export function isGrayscale(color, tolerance = 8) {
  const values = [color.r, color.g, color.b];
  return Math.max(...values) - Math.min(...values) <= tolerance;
}

function violation(file, line, rule, message) {
  return { file, line, rule, message };
}

export function auditCss(css, file = "src/app/globals.css") {
  const violations = [];
  const stripped = stripCssComments(css);

  for (const match of stripped.matchAll(/!important/gi)) {
    violations.push(
      violation(file, lineAt(stripped, match.index), "no-important", "禁止使用 !important"),
    );
  }

  for (const pattern of LEGACY_ACCENTS) {
    for (const match of stripped.matchAll(pattern)) {
      violations.push(
        violation(
          file,
          lineAt(stripped, match.index),
          "legacy-accent",
          `发现旧强调色: ${match[0]}`,
        ),
      );
    }
  }

  const lightBlock = extractBlock(stripped, ':root[data-theme="light"]');
  if (!lightBlock) {
    violations.push(violation(file, 1, "light-block", "缺少 :root[data-theme=\"light\"] 主题块"));
  } else {
    let offset = 0;
    for (const rawLine of lightBlock.content.split("\n")) {
      const lineStart = lightBlock.start + offset;
      offset += rawLine.length + 1;
      const trimmed = rawLine.trim();
      if (!trimmed || trimmed.startsWith("/*") || trimmed.startsWith("*")) continue;
      const declaration = /^([\w-]+)\s*:/.exec(trimmed);
      if (!declaration) continue;
      const property = declaration[1];
      if (property !== "color-scheme" && !property.startsWith("--ds-")) {
        violations.push(
          violation(
            file,
            lineAt(stripped, lineStart),
            "light-theme-token-only",
            `浅色主题块只允许 --ds-* 声明，发现: ${property}`,
          ),
        );
      }
    }
  }

  const rootBlock = extractBlock(stripped, ":root");
  const rootTokens = rootBlock ? parseDeclarations(rootBlock.content) : new Map();
  const lightTokens = lightBlock ? parseDeclarations(lightBlock.content) : new Map();
  const tokenFor = (name, theme) =>
    theme === "light" && lightTokens.has(name) ? lightTokens.get(name) : rootTokens.get(name);

  for (const theme of ["dark", "light"]) {
    const bg = parseColor(tokenFor("--ds-action-bg", theme));
    const fg = parseColor(tokenFor("--ds-action-fg", theme));
    if (!bg || !fg) {
      violations.push(
        violation(file, 1, "action-inverse", `${theme} 主题缺少可解析的 --ds-action-bg / --ds-action-fg`),
      );
      continue;
    }
    const ratio = contrastRatio(bg, fg);
    if (ratio < 4.5) {
      violations.push(
        violation(
          file,
          1,
          "action-inverse",
          `${theme} 主题主按钮对比度 ${ratio.toFixed(2)} < 4.5`,
        ),
      );
    }
    const inverted =
      theme === "dark"
        ? relativeLuminance(bg) > relativeLuminance(fg)
        : relativeLuminance(bg) < relativeLuminance(fg);
    if (!inverted) {
      violations.push(
        violation(file, 1, "action-inverse", `${theme} 主题主按钮未按反色方向配置`),
      );
    }
  }

  for (const theme of ["dark", "light"]) {
    const surface = parseColor(tokenFor("--ds-qr-surface", theme));
    const dark = parseColor(tokenFor("--ds-qr-dark", theme));
    if (!surface || !dark) {
      violations.push(
        violation(file, 1, "qr-contrast", `${theme} 主题缺少可解析的二维码令牌`),
      );
      continue;
    }
    const ratio = contrastRatio(surface, dark);
    if (ratio < 7) {
      violations.push(
        violation(file, 1, "qr-contrast", `${theme} 主题二维码对比度 ${ratio.toFixed(2)} < 7`),
      );
    }
  }

  return violations;
}

export function auditSourceText(text, file) {
  const violations = [];
  const isStyle = file.endsWith(".css");

  for (const pattern of LEGACY_ACCENTS) {
    for (const match of text.matchAll(pattern)) {
      violations.push(
        violation(file, lineAt(text, match.index), "legacy-accent", `发现旧强调色: ${match[0]}`),
      );
    }
  }

  for (const match of text.matchAll(COLOR_UTILITY_RE)) {
    violations.push(
      violation(
        file,
        lineAt(text, match.index),
        "colored-utility",
        `禁止 Tailwind 彩色工具类: ${match[0]}`,
      ),
    );
  }

  for (const match of text.matchAll(NON_TOKEN_GRAY_RE)) {
    violations.push(
      violation(
        file,
        lineAt(text, match.index),
        "non-token-gray",
        `请使用语义令牌而非黑白工具类: ${match[0]}`,
      ),
    );
  }

  if (!isStyle) {
    for (const match of text.matchAll(HEX_RE)) {
      const color = parseColor(match[0]);
      if (color && !isGrayscale(color)) {
        violations.push(
          violation(
            file,
            lineAt(text, match.index),
            "hardcoded-color",
            `组件不得硬编码彩色值: ${match[0]}（请新增 --ds-* 令牌）`,
          ),
        );
      }
    }

    for (const match of text.matchAll(RGB_RE)) {
      const color = parseColor(match[0]);
      if (color && !isGrayscale(color)) {
        violations.push(
          violation(
            file,
            lineAt(text, match.index),
            "hardcoded-color",
            `组件不得硬编码彩色值: ${match[0]}（请新增 --ds-* 令牌）`,
          ),
        );
      }
    }
  }

  return violations;
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      walk(fullPath, files);
    } else if (/\.(ts|tsx|css)$/.test(entry)) {
      files.push(fullPath);
    }
  }
  return files;
}

export function auditProject(rootDir = ROOT) {
  const srcDir = path.join(rootDir, "src");
  const files = walk(srcDir);
  const violations = [];

  for (const filePath of files) {
    const relative = path.relative(rootDir, filePath).split(path.sep).join("/");
    const text = readFileSync(filePath, "utf8");
    if (relative === "src/app/globals.css") {
      violations.push(...auditCss(text, relative));
    } else {
      violations.push(...auditSourceText(text, relative));
    }
  }

  return { filesChecked: files.length, violations };
}

export function formatViolations(violations) {
  return violations
    .map((item) => `  ${item.file}:${item.line} [${item.rule}] ${item.message}`)
    .join("\n");
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log("用法: node scripts/visual-audit.mjs [--json] [--root <dir>]");
    return;
  }
  const json = args.includes("--json");
  const rootIndex = args.indexOf("--root");
  const rootDir = rootIndex >= 0 ? path.resolve(args[rootIndex + 1] ?? "") : ROOT;

  const result = auditProject(rootDir);

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`黑白灰视觉纪律审计：检查 ${result.filesChecked} 个文件`);
    if (result.violations.length === 0) {
      console.log("✓ 0 violation");
    } else {
      console.error(`✗ ${result.violations.length} violation`);
      console.error(formatViolations(result.violations));
    }
  }

  if (result.violations.length > 0) {
    process.exit(1);
  }
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main();
}
