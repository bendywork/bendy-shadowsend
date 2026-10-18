import assert from "node:assert/strict";
import test from "node:test";
import {
  auditCss,
  auditProject,
  auditSourceText,
  contrastRatio,
  isGrayscale,
  parseColor,
  relativeLuminance,
} from "./visual-audit.mjs";

const CLEAN_CSS = `:root {
  color-scheme: dark;
  --ds-action-bg: #f4f4f5;
  --ds-action-fg: #18181b;
  --ds-qr-surface: #ffffff;
  --ds-qr-dark: #000000;
}
:root[data-theme="light"] {
  color-scheme: light;
  --ds-action-bg: #18181b;
  --ds-action-fg: #fafafa;
}`;

test("parseColor 支持 hex 与 rgb，非法值返回 null", () => {
  assert.deepEqual(parseColor("#fff"), { r: 255, g: 255, b: 255 });
  assert.deepEqual(parseColor("#18181b"), { r: 24, g: 24, b: 27 });
  assert.deepEqual(parseColor("rgb(17, 17, 19)"), { r: 17, g: 17, b: 19 });
  assert.deepEqual(parseColor("rgb(17 17 19 / 0.5)"), { r: 17, g: 17, b: 19 });
  assert.equal(parseColor("var(--ds-ink)"), null);
  assert.equal(parseColor("red"), null);
});

test("对比度计算符合 WCAG 黑白基准", () => {
  const white = parseColor("#ffffff");
  const black = parseColor("#000000");
  assert.equal(relativeLuminance(white), 1);
  assert.equal(relativeLuminance(black), 0);
  assert.equal(contrastRatio(white, black), 21);
  assert.ok(contrastRatio(parseColor("#777777"), white) > 4.4);
});

test("isGrayscale 只接受中性灰", () => {
  assert.equal(isGrayscale(parseColor("#6b6b6b")), true);
  assert.equal(isGrayscale(parseColor("#52525b")), false);
  assert.equal(isGrayscale(parseColor("#ff0000")), false);
});

test("auditCss 接受合规的双主题令牌", () => {
  assert.deepEqual(auditCss(CLEAN_CSS), []);
});

test("auditCss 拦截 !important 与旧强调色", () => {
  const css = `${CLEAN_CSS}
body { color: #fff !important; }
.legacy { color: #0a84ff; }`;
  const rules = auditCss(css).map((item) => item.rule);
  assert.ok(rules.includes("no-important"));
  assert.ok(rules.includes("legacy-accent"));
});

test("auditCss 要求浅色主题块只声明 --ds-*", () => {
  const css = CLEAN_CSS.replace(
    ':root[data-theme="light"] {',
    ':root[data-theme="light"] {\n  background: #ffffff;',
  );
  const violations = auditCss(css);
  assert.ok(violations.some((item) => item.rule === "light-theme-token-only"));
});

test("auditCss 校验主按钮反色方向与 4.5:1", () => {
  const wrongDirection = CLEAN_CSS.replace("--ds-action-bg: #f4f4f5;", "--ds-action-bg: #18181b;").replace(
    "--ds-action-fg: #18181b;",
    "--ds-action-fg: #f4f4f5;",
  );
  const violations = auditCss(wrongDirection);
  assert.ok(violations.some((item) => item.rule === "action-inverse"));

  const lowContrast = CLEAN_CSS.replace("--ds-action-fg: #18181b;", "--ds-action-fg: #dddddd;");
  assert.ok(
    auditCss(lowContrast).some(
      (item) => item.rule === "action-inverse" && item.message.includes("4.5"),
    ),
  );
});

test("auditCss 校验二维码 7:1", () => {
  const lowContrast = CLEAN_CSS.replace("--ds-qr-dark: #000000;", "--ds-qr-dark: #dddddd;");
  assert.ok(auditCss(lowContrast).some((item) => item.rule === "qr-contrast"));
});

test("auditSourceText 拦截彩色工具类与黑白工具类", () => {
  const violations = auditSourceText(
    'const cls = "bg-blue-500 text-white hover:text-red-400";',
    "src/components/demo.tsx",
  );
  const rules = violations.map((item) => item.rule);
  assert.ok(rules.includes("colored-utility"));
  assert.ok(rules.includes("non-token-gray"));
  assert.equal(violations[0].line, 1);
});

test("auditSourceText 拦截旧强调色与硬编码彩色值", () => {
  const text = ['const legacy = "#0a84ff";', 'const danger = "#ff0000";'].join("\n");
  const violations = auditSourceText(text, "src/components/demo.tsx");
  assert.ok(violations.some((item) => item.rule === "legacy-accent"));
  assert.ok(violations.some((item) => item.rule === "hardcoded-color" && item.line === 2));
});

test("auditSourceText 允许中性灰与半透明中性灰", () => {
  const text = [
    'const neutral = "#6b6b6b";',
    'const overlay = "rgb(17 17 19 / 0.5)";',
    'const short = "#fff";',
  ].join("\n");
  assert.deepEqual(auditSourceText(text, "src/components/demo.tsx"), []);
});

test("auditProject 当前仓库零违规", () => {
  const result = auditProject();
  assert.ok(result.filesChecked > 0);
  assert.deepEqual(result.violations, []);
});
