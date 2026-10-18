import assert from "node:assert/strict";
import test from "node:test";
import {
  BASELINE_VIEWPORT_NAMES,
  PAGES,
  THEMES,
  VIEWPORTS,
  buildBaselineEntries,
  buildFileName,
  createManifest,
  getBreakpoint,
  getViewport,
  parseArgs,
  sanitizeSegment,
  validateManifest,
} from "./visual-baseline-lib.mjs";

const FAKE_SHA = "a".repeat(64);

function manifestWith(entries) {
  return createManifest({
    version: "0.1.69",
    baseUrl: "http://127.0.0.1:3000",
    entries,
  });
}

test("getBreakpoint 覆盖 767/768/1279/1280 边界", () => {
  assert.equal(getBreakpoint(0), "mobile");
  assert.equal(getBreakpoint(767), "mobile");
  assert.equal(getBreakpoint(768), "tablet");
  assert.equal(getBreakpoint(1279), "tablet");
  assert.equal(getBreakpoint(1280), "desktop");
  assert.equal(getBreakpoint(1920), "desktop");
  assert.throws(() => getBreakpoint(Number.NaN), /有限数字/);
  assert.throws(() => getBreakpoint(-1), /有限数字/);
});

test("默认矩阵为 3 页面 × 2 主题 × 3 视口 = 18 项", () => {
  const entries = buildBaselineEntries();
  assert.equal(entries.length, PAGES.length * THEMES.length * BASELINE_VIEWPORT_NAMES.length);
  assert.equal(entries.length, 18);
  assert.equal(new Set(entries.map((entry) => entry.id)).size, 18);
  assert.equal(new Set(entries.map((entry) => entry.file)).size, 18);
});

test("每个条目都有合法断点、主题与唯一文件名", () => {
  for (const entry of buildBaselineEntries()) {
    assert.ok(THEMES.includes(entry.theme));
    assert.equal(entry.viewport.breakpoint, getBreakpoint(entry.viewport.width));
    assert.match(entry.file, /^[a-z0-9-]+--(dark|light)--\d+x\d+\.png$/);
    assert.equal(
      entry.file,
      buildFileName(entry.page, entry.theme, entry.viewport),
    );
  }
});

test("buildFileName 拒绝未知主题与非法 page key", () => {
  const viewport = getViewport("desktop-1440");
  assert.equal(buildFileName("home", "dark", viewport), "home--dark--1440x900.png");
  assert.throws(() => buildFileName("home", "sepia", viewport), /未知主题/);
  assert.throws(() => buildFileName("../home", "dark", viewport), /只允许/);
  assert.throws(() => buildFileName("home", "dark", { width: 1.5, height: 2 }), /整数/);
});

test("sanitizeSegment 拒绝路径穿越与空值", () => {
  assert.equal(sanitizeSegment("not-found"), "not-found");
  assert.throws(() => sanitizeSegment(".."), /只允许/);
  assert.throws(() => sanitizeSegment("a/b"), /只允许/);
  assert.throws(() => sanitizeSegment(""), /只允许/);
});

test("validateManifest 接受完整 manifest", () => {
  const entries = buildBaselineEntries().map((entry) => ({
    ...entry,
    sha256: FAKE_SHA,
    bytes: 1024,
  }));
  const result = validateManifest(manifestWith(entries));
  assert.deepEqual(result, { valid: true, errors: [] });
});

test("validateManifest 拒绝重复 id / file 与缺失字段", () => {
  const entries = buildBaselineEntries().map((entry) => ({
    ...entry,
    sha256: FAKE_SHA,
    bytes: 1024,
  }));
  const duplicated = [entries[0], { ...entries[1], id: entries[0].id, file: entries[0].file }];
  const result = validateManifest(manifestWith(duplicated));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("id 重复")));
  assert.ok(result.errors.some((error) => error.includes("file 重复")));

  const missing = validateManifest(manifestWith([{ id: "x" }]));
  assert.equal(missing.valid, false);
  assert.ok(missing.errors.length >= 5);
});

test("validateManifest 对空模板需显式 allowEmpty", () => {
  const manifest = manifestWith([]);
  assert.equal(validateManifest(manifest).valid, false);
  assert.equal(validateManifest(manifest, { allowEmpty: true }).valid, true);
});

test("validateManifest 校验断点与宽度一致", () => {
  const entry = {
    ...buildBaselineEntries()[0],
    viewport: { name: "desktop-1440", width: 1440, height: 900, breakpoint: "mobile" },
    sha256: FAKE_SHA,
    bytes: 1,
  };
  const result = validateManifest(manifestWith([entry]));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("breakpoint 与宽度不符")));
});

test("parseArgs 默认值与覆盖", () => {
  const defaults = parseArgs([]);
  assert.equal(defaults.baseUrl, "http://127.0.0.1:3000");
  assert.equal(defaults.mock, true);
  assert.deepEqual(defaults.themes, [...THEMES]);
  assert.deepEqual(defaults.viewportNames, [...BASELINE_VIEWPORT_NAMES]);
  assert.equal(defaults.fullPage, false);

  const overridden = parseArgs([
    "--base-url",
    "https://example.com/",
    "--version",
    "0.1.69",
    "--themes",
    "light,dark,light",
    "--viewports",
    "mobile-360,desktop-1920",
    "--full-page",
    "--no-mock",
    "--timeout",
    "5000",
  ]);
  assert.equal(overridden.baseUrl, "https://example.com");
  assert.equal(overridden.version, "0.1.69");
  assert.deepEqual(overridden.themes, ["light", "dark"]);
  assert.deepEqual(overridden.viewportNames, ["mobile-360", "desktop-1920"]);
  assert.equal(overridden.fullPage, true);
  assert.equal(overridden.mock, false);
  assert.equal(overridden.timeoutMs, 5000);
});

test("parseArgs 拒绝未知参数与非法值", () => {
  assert.throws(() => parseArgs(["--nope"]), /未知参数/);
  assert.throws(() => parseArgs(["--version", "v0.1.69"]), /semver/);
  assert.throws(() => parseArgs(["--themes", "dark,blue"]), /未知主题/);
  assert.throws(() => parseArgs(["--viewports", "watch"]), /未知视口/);
  assert.throws(() => parseArgs(["--base-url"]), /缺少参数值/);
  assert.throws(() => parseArgs(["--timeout", "0"]), /正整数/);
});

test("VIEWPORTS 覆盖三档断点且尺寸唯一", () => {
  assert.equal(VIEWPORTS.length, 9);
  assert.equal(new Set(VIEWPORTS.map((viewport) => `${viewport.width}x${viewport.height}`)).size, 9);
  for (const name of ["mobile", "tablet", "desktop"]) {
    assert.ok(VIEWPORTS.some((viewport) => viewport.breakpoint === name));
  }
});
