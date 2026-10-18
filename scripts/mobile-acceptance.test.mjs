import test from "node:test";
import assert from "node:assert/strict";
import {
  MOBILE_VIEWPORT,
  PERF_BUDGETS,
  PERF_METRIC_KEYS,
  PERF_PROFILES,
  SMOKE_FLOWS,
  aggregateRuns,
  buildPerfPlan,
  createPerfManifest,
  createSmokeManifest,
  evaluateBudgets,
  getPerfProfile,
  median,
  parsePerfArgs,
  parseSmokeArgs,
  percentile,
  summarizeSmokeResults,
  validatePerfManifest,
} from "./mobile-acceptance-lib.mjs";

const baseMetrics = {
  lcpMs: 1800,
  fcpMs: 900,
  ttfbMs: 320,
  cls: 0.03,
  interactionMs: 80,
  maxLongTaskMs: 120,
  longTaskCount: 1,
  jsEncodedBytes: 240_000,
  scrollP95FrameMs: 24,
  scrollDroppedFrameRatio: 0.02,
};

function metrics(overrides = {}) {
  return { ...baseMetrics, ...overrides };
}

test("移动端视口为 390×844 / DPR 3", () => {
  assert.equal(MOBILE_VIEWPORT.width, 390);
  assert.equal(MOBILE_VIEWPORT.height, 844);
  assert.equal(MOBILE_VIEWPORT.deviceScaleFactor, 3);
});

test("默认性能计划覆盖 2 档位 × 2 页面，每项 3 次", () => {
  const plan = buildPerfPlan();
  assert.equal(plan.length, 4);
  assert.deepEqual(
    plan.map((entry) => entry.id),
    [
      "mobile-standard--home",
      "mobile-standard--room",
      "mobile-low-end--home",
      "mobile-low-end--room",
    ],
  );
  assert.ok(plan.every((entry) => entry.runs === 3));
});

test("性能计划支持自定义档位、页面与运行次数", () => {
  const plan = buildPerfPlan({
    profiles: ["mobile-low-end"],
    pages: ["room"],
    runs: 5,
  });
  assert.equal(plan.length, 1);
  assert.equal(plan[0].profile.cpuThrottlingRate, 4);
  assert.equal(plan[0].page.path, "/room/DEMO01");
  assert.equal(plan[0].runs, 5);
});

test("性能计划拒绝未知档位与非法运行次数", () => {
  assert.throws(() => getPerfProfile("desktop"), /未知性能档位/);
  assert.throws(() => buildPerfPlan({ runs: 0 }), /runs/);
  assert.throws(() => buildPerfPlan({ runs: 11 }), /runs/);
  assert.throws(() => buildPerfPlan({ profiles: [] }), /profiles/);
});

test("中位数处理奇数与偶数样本", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.throws(() => median([]), /非空/);
  assert.throws(() => median([1, Number.NaN]), /非法数值/);
});

test("百分位使用 nearest-rank，p95 可定位长帧", () => {
  const frames = Array.from({ length: 100 }, (_, index) => index + 1);
  assert.equal(percentile(frames, 0.95), 95);
  assert.equal(percentile([10], 0.95), 10);
  assert.throws(() => percentile([], 0.95), /非空/);
  assert.throws(() => percentile([1], 0), /p 必须/);
});

test("多次运行按指标取中位数并保留原始样本", () => {
  const runs = [
    metrics({ lcpMs: 2000, scrollP95FrameMs: 30 }),
    metrics({ lcpMs: 1500, scrollP95FrameMs: 20 }),
    metrics({ lcpMs: 2500, scrollP95FrameMs: 40 }),
  ];
  const aggregate = aggregateRuns(runs);
  assert.equal(aggregate.metrics.lcpMs, 2000);
  assert.equal(aggregate.metrics.scrollP95FrameMs, 30);
  assert.equal(aggregate.runs.length, 3);
  assert.equal(PERF_METRIC_KEYS.every((key) => typeof aggregate.metrics[key] === "number"), true);
});

test("预算判定：全部达标时通过", () => {
  const result = evaluateBudgets(metrics());
  assert.equal(result.pass, true);
  assert.equal(result.violations.length, 0);
  assert.equal(result.checks.length, 8);
});

test("预算判定：LCP / CLS / TTFB / 交互超阈值分别失败", () => {
  const lcp = evaluateBudgets(metrics({ lcpMs: 2600 }));
  assert.equal(lcp.pass, false);
  assert.equal(lcp.violations[0].key, "lcpMs");

  const cls = evaluateBudgets(metrics({ cls: 0.12 }));
  assert.equal(cls.pass, false);
  assert.equal(cls.violations[0].key, "cls");

  const ttfb = evaluateBudgets(metrics({ ttfbMs: 900 }));
  assert.equal(ttfb.pass, false);
  assert.equal(ttfb.violations[0].key, "ttfbMs");

  const interaction = evaluateBudgets(metrics({ interactionMs: 240 }));
  assert.equal(interaction.pass, false);
  assert.equal(interaction.violations[0].key, "interactionMs");
});

test("预算判定：长任务与滚动指标超阈值失败", () => {
  const longTask = evaluateBudgets(metrics({ maxLongTaskMs: 260 }));
  assert.equal(longTask.pass, false);
  assert.equal(longTask.violations[0].key, "maxLongTaskMs");

  const scrollP95 = evaluateBudgets(metrics({ scrollP95FrameMs: 64 }));
  assert.equal(scrollP95.pass, false);
  assert.equal(scrollP95.violations[0].key, "scrollP95FrameMs");

  const dropped = evaluateBudgets(metrics({ scrollDroppedFrameRatio: 0.2 }));
  assert.equal(dropped.pass, false);
  assert.equal(dropped.violations[0].key, "scrollDroppedFrameRatio");
});

test("预算判定：缺失指标按失败处理", () => {
  const result = evaluateBudgets({ ...metrics(), lcpMs: undefined });
  assert.equal(result.pass, false);
  assert.equal(result.violations[0].reason, "指标缺失");
});

test("首屏 JS 相对上一基线增长 >10% 时失败", () => {
  const previous = { jsEncodedBytes: 200_000 };
  const grown = evaluateBudgets(metrics({ jsEncodedBytes: 221_000 }), { previous });
  assert.equal(grown.pass, false);
  assert.match(grown.violations[0].reason, /10\.5%/);

  const within = evaluateBudgets(metrics({ jsEncodedBytes: 219_000 }), { previous });
  assert.equal(within.pass, true);

  const firstBaseline = evaluateBudgets(metrics(), { previous: null });
  assert.equal(firstBaseline.pass, true);
  assert.match(
    firstBaseline.checks.find((check) => check.key === "jsEncodedBytes").reason,
    /无上一基线/,
  );
});

test("自定义预算可覆盖默认阈值", () => {
  const result = evaluateBudgets(metrics({ lcpMs: 2600 }), {
    budgets: { lcpMs: 3000 },
  });
  assert.equal(result.pass, true);
});

test("性能 manifest 生成与校验通过", () => {
  const entry = {
    id: "mobile-low-end--home",
    profile: "mobile-low-end",
    page: "home",
    path: "/",
    runs: 3,
    metrics: metrics(),
    budgets: evaluateBudgets(metrics()),
    pass: true,
  };
  const manifest = createPerfManifest({
    version: "0.1.69",
    baseUrl: "http://127.0.0.1:3000",
    entries: [entry],
  });
  assert.equal(manifest.kind, "mobile-performance");
  assert.equal(manifest.summary.total, 1);
  assert.equal(manifest.budgets, PERF_BUDGETS);
  const validation = validatePerfManifest(manifest);
  assert.equal(validation.valid, true, validation.errors.join("; "));
});

test("性能 manifest 校验拒绝空 entries、重复 id 与缺失指标", () => {
  const empty = validatePerfManifest({
    schemaVersion: 1,
    kind: "mobile-performance",
    baselineVersion: "0.1.69",
    capturedAt: new Date().toISOString(),
    baseUrl: "http://127.0.0.1:3000",
    entries: [],
  });
  assert.equal(empty.valid, false);
  assert.match(empty.errors.join(";"), /entries 不能为空/);

  const entry = {
    id: "dup",
    profile: "mobile-low-end",
    page: "home",
    path: "/",
    runs: 3,
    metrics: { ...metrics(), cls: "0.1" },
    budgets: { pass: true },
    pass: true,
  };
  const invalid = validatePerfManifest({
    schemaVersion: 1,
    kind: "mobile-performance",
    baselineVersion: "0.1.69",
    capturedAt: new Date().toISOString(),
    baseUrl: "http://127.0.0.1:3000",
    entries: [entry, { ...entry }],
  });
  assert.equal(invalid.valid, false);
  assert.match(invalid.errors.join(";"), /metrics\.cls/);
  assert.match(invalid.errors.join(";"), /id 重复/);
});

test("性能 CLI 参数默认值与自定义值", () => {
  const defaults = parsePerfArgs([]);
  assert.equal(defaults.baseUrl, "http://127.0.0.1:3000");
  assert.equal(defaults.runs, 3);
  assert.deepEqual(defaults.profiles, PERF_PROFILES.map((profile) => profile.key));

  const custom = parsePerfArgs([
    "--base-url",
    "http://localhost:4000/",
    "--version",
    "0.1.69",
    "--profiles",
    "mobile-low-end",
    "--pages",
    "room",
    "--runs",
    "2",
    "--previous",
    "old.json",
    "--no-mock",
  ]);
  assert.equal(custom.baseUrl, "http://localhost:4000");
  assert.equal(custom.version, "0.1.69");
  assert.deepEqual(custom.profiles, ["mobile-low-end"]);
  assert.deepEqual(custom.pages, ["room"]);
  assert.equal(custom.runs, 2);
  assert.equal(custom.previous, "old.json");
  assert.equal(custom.mock, false);
});

test("性能 CLI 参数拒绝非法值", () => {
  assert.throws(() => parsePerfArgs(["--version", "v1"]), /semver/);
  assert.throws(() => parsePerfArgs(["--runs", "0"]), /runs/);
  assert.throws(() => parsePerfArgs(["--profiles", "desktop"]), /未知性能档位/);
  assert.throws(() => parsePerfArgs(["--unknown"]), /未知参数/);
});

test("冒烟 CLI 参数默认值与自定义值", () => {
  const defaults = parseSmokeArgs([]);
  assert.equal(defaults.baseUrl, "http://127.0.0.1:3000");
  assert.equal(defaults.mock, true);
  assert.equal(defaults.dryRun, false);

  const custom = parseSmokeArgs([
    "--base-url",
    "http://localhost:4100/",
    "--version",
    "0.1.70",
    "--out",
    "tmp/smoke",
    "--timeout",
    "30000",
    "--no-mock",
    "--dry-run",
  ]);
  assert.equal(custom.baseUrl, "http://localhost:4100");
  assert.equal(custom.version, "0.1.70");
  assert.equal(custom.outDir, "tmp/smoke");
  assert.equal(custom.timeoutMs, 30000);
  assert.equal(custom.mock, false);
  assert.equal(custom.dryRun, true);
});

test("冒烟 CLI 参数拒绝非法值", () => {
  assert.throws(() => parseSmokeArgs(["--version", "latest"]), /semver/);
  assert.throws(() => parseSmokeArgs(["--timeout", "0"]), /正整数/);
  assert.throws(() => parseSmokeArgs(["--base-url", "ftp://example.com"]), /http/);
  assert.throws(() => parseSmokeArgs(["--unknown"]), /未知参数/);
});

test("冒烟结果汇总：全部通过才整体通过", () => {
  const pass = summarizeSmokeResults([
    { key: "join-room", status: "pass" },
    { key: "chat", status: "pass" },
    { key: "drawer", status: "skipped" },
  ]);
  assert.equal(pass.pass, true);
  assert.equal(pass.passed, 2);
  assert.equal(pass.total, 3);
  assert.equal(pass.skipped, 1);

  const fail = summarizeSmokeResults([
    { key: "join-room", status: "pass" },
    { key: "chat", status: "fail" },
  ]);
  assert.equal(fail.pass, false);
  assert.equal(fail.failed, 1);
});

test("冒烟记录包含四条 P0 核心流程", () => {
  assert.deepEqual(
    SMOKE_FLOWS.map((flow) => flow.key),
    ["join-room", "chat", "upload", "drawer"],
  );
  assert.ok(SMOKE_FLOWS.every((flow) => flow.priority === "P0"));
});

test("冒烟 manifest 生成并记录汇总", () => {
  const manifest = createSmokeManifest({
    version: "0.1.69",
    baseUrl: "http://127.0.0.1:3000",
    results: [{ key: "join-room", status: "pass" }],
  });
  assert.equal(manifest.kind, "mobile-smoke");
  assert.equal(manifest.summary.pass, true);
  assert.equal(manifest.summary.passed, 1);
});
