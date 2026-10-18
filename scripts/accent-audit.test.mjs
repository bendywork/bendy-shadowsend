import assert from "node:assert/strict";
import test from "node:test";
import {
  checkPrimaryButtonInversion,
  isAllowedTokenColor,
  isNeutralColorLiteral,
  scanRepository,
  scanSource,
} from "./accent-audit.mjs";

const PAGE = "src/app/page.tsx";
const CSS = "src/app/globals.css";
const AVATAR = "src/lib/avatar-color.ts";

test("classifies neutral and semantic colours", () => {
  assert.equal(isNeutralColorLiteral("#3f3f46"), true);
  assert.equal(isNeutralColorLiteral("#fff"), true);
  assert.equal(isNeutralColorLiteral("#0a84ff"), false);
  assert.equal(isAllowedTokenColor("#30d158"), true);
  assert.equal(isAllowedTokenColor("rgb(26 127 55 / 0.32)"), true);
  assert.equal(isAllowedTokenColor("rgb(255 0 0)"), false);
});

test("detects legacy system-blue accents", () => {
  const violations = scanSource(
    'const accent = "#0a84ff"; const old = "#0071e3";',
    PAGE,
  );
  assert.equal(violations.filter((item) => item.rule === "legacy-accent").length, 2);
});

test("detects default Tailwind palette utilities", () => {
  const violations = scanSource(
    'const cls = "bg-blue-500 text-red-400 border-slate-200";',
    PAGE,
  );
  assert.equal(
    violations.filter((item) => item.rule === "tailwind-palette").length,
    3,
  );
});

test("detects inline text colours and hard-coded values", () => {
  const violations = scanSource(
    '<span style={{ color: "#ff0000" }}>x</span>',
    PAGE,
  );
  assert.equal(
    violations.filter((item) => item.rule === "inline-text-color").length,
    1,
  );
  assert.equal(
    violations.filter((item) => item.rule === "hardcoded-color").length,
    1,
  );
});

test("allows neutral tokens only in the two token files", () => {
  assert.equal(scanSource('const c = "#3f3f46";', AVATAR).length, 0);
  assert.equal(scanSource(":root { --x: #3f3f46; }", CSS).length, 0);
  assert.equal(
    scanSource('const c = "#3f3f46";', PAGE).filter(
      (item) => item.rule === "hardcoded-color",
    ).length,
    1,
  );
});

test("rejects saturated colours inside the token files", () => {
  const avatarViolations = scanSource('const c = "#0a84ff";', AVATAR);
  assert.equal(
    avatarViolations.filter((item) => item.rule === "hardcoded-color").length,
    1,
  );
  const cssViolations = scanSource(":root { --x: #ff0000; }", CSS);
  assert.equal(
    cssViolations.filter((item) => item.rule === "hardcoded-color").length,
    1,
  );
});

test("primary button tokens invert and keep AA contrast", () => {
  const css = `
:root {
  --ds-action-bg: #f5f5f7;
  --ds-action-fg: #08080a;
}
:root[data-theme="light"] {
  --ds-action-bg: #111113;
  --ds-action-fg: #ffffff;
}
`;
  assert.deepEqual(checkPrimaryButtonInversion(css), []);
});

test("reports non-inverted primary buttons", () => {
  const css = `
:root {
  --ds-action-bg: #08080a;
  --ds-action-fg: #ffffff;
}
:root[data-theme="light"] {
  --ds-action-bg: #ffffff;
  --ds-action-fg: #111113;
}
`;
  const problems = checkPrimaryButtonInversion(css);
  assert.equal(problems.filter((item) => item.rule === "primary-inversion").length, 2);
});

test("repository currently has zero accent violations", () => {
  const { violations } = scanRepository();
  assert.deepEqual(violations, []);
});
