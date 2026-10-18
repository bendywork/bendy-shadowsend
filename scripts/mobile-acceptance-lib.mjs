/**
 * 移动端验收与性能基线的纯函数层。
 *
 * 不依赖浏览器、文件系统或网络，便于用 node:test 覆盖：
 * - 性能测量矩阵、运行次数与配置档位；
 * - 指标聚合（中位数 / 百分位）与预算判定；
 * - manifest 生成与校验；
 * - CLI 参数解析；
 * - 核心流程冒烟结果汇总。
 */

export const MOBILE_VIEWPORT = Object.freeze({
  name: "mobile-390",
  width: 390,
  height: 844,
  deviceScaleFactor: 3,
});

export const PERF_PAGES = Object.freeze([
  Object.freeze({ key: "home", path: "/", readySelector: "main" }),
  Object.freeze({ key: "room", path: "/room/DEMO01", readySelector: "main" }),
]);

/**
 * Slow 4G 口径与 Lighthouse 移动端默认值一致：
 * 下行 1.6 Mbps、上行 750 Kbps、RTT 150ms（CDP 使用 bytes/s）。
 */
export const SLOW_4G = Object.freeze({
  downloadThroughput: 200_000,
  uploadThroughput: 93_750,
  latency: 150,
});

export const PERF_PROFILES = Object.freeze([
  Object.freeze({
    key: "mobile-standard",
    label: "移动端常规（无 CPU / 网络节流）",
    cpuThrottlingRate: 1,
    network: null,
  }),
  Object.freeze({
    key: "mobile-low-end",
    label: "低端 Android（CPU 4× + Slow 4G）",
    cpuThrottlingRate: 4,
    network: SLOW_4G,
  }),
]);

/**
 * 阈值与 ui-46 视觉验收清单 §7.2 对齐；滚动指标为 ui-48 新增。
 * jsGrowthRatio 为相对上一基线的允许增长比例。
 */
export const PERF_BUDGETS = Object.freeze({
  lcpMs: 2500,
  cls: 0.1,
  ttfbMs: 800,
  interactionMs: 200,
  maxLongTaskMs: 200,
  scrollP95FrameMs: 50,
  scrollDroppedFrameRatio: 0.1,
  jsGrowthRatio: 0.1,
});

export const PERF_METRIC_KEYS = Object.freeze([
  "lcpMs",
  "fcpMs",
  "ttfbMs",
  "cls",
  "interactionMs",
  "maxLongTaskMs",
  "longTaskCount",
  "jsEncodedBytes",
  "scrollP95FrameMs",
  "scrollDroppedFrameRatio",
]);

export const SMOKE_FLOWS = Object.freeze([
  Object.freeze({ key: "join-room", label: "加入房间", priority: "P0" }),
  Object.freeze({ key: "chat", label: "发送文本消息", priority: "P0" }),
  Object.freeze({ key: "upload", label: "上传并发送文件", priority: "P0" }),
  Object.freeze({ key: "drawer", label: "打开 / 关闭房间抽屉", priority: "P0" }),
]);

const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

export function getPerfProfile(key) {
  const profile = PERF_PROFILES.find((item) => item.key === key);
  if (!profile) {
    throw new Error(
      `未知性能档位: ${String(key)}。可选值: ${PERF_PROFILES.map((item) => item.key).join(", ")}`,
    );
  }
  return profile;
}

export function getPerfPage(key) {
  const page = PERF_PAGES.find((item) => item.key === key);
  if (!page) {
    throw new Error(
      `未知页面: ${String(key)}。可选值: ${PERF_PAGES.map((item) => item.key).join(", ")}`,
    );
  }
  return page;
}

export function buildPerfPlan(options = {}) {
  const profileKeys = options.profiles ?? PERF_PROFILES.map((item) => item.key);
  const pageKeys = options.pages ?? PERF_PAGES.map((item) => item.key);
  const runs = options.runs ?? 3;

  if (!Array.isArray(profileKeys) || profileKeys.length === 0) {
    throw new Error("profiles 不能为空");
  }
  if (!Array.isArray(pageKeys) || pageKeys.length === 0) {
    throw new Error("pages 不能为空");
  }
  if (!Number.isInteger(runs) || runs < 1 || runs > 10) {
    throw new Error("runs 必须是 1-10 的整数");
  }

  const seen = new Set();
  return profileKeys.flatMap((profileKey) => {
    const profile = getPerfProfile(profileKey);
    return pageKeys.map((pageKey) => {
      const page = getPerfPage(pageKey);
      const id = `${profile.key}--${page.key}`;
      if (seen.has(id)) throw new Error(`重复的性能测量项: ${id}`);
      seen.add(id);
      return { id, profile, page, runs };
    });
  });
}

export function median(values) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error("median 需要非空数值数组");
  }
  const numbers = values.map((value) => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`median 收到非法数值: ${String(value)}`);
    }
    return value;
  });
  const sorted = [...numbers].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

export function percentile(values, p) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error("percentile 需要非空数值数组");
  }
  if (typeof p !== "number" || p <= 0 || p > 1) {
    throw new Error("percentile 的 p 必须在 (0, 1] 内");
  }
  const sorted = values
    .map((value) => {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`percentile 收到非法数值: ${String(value)}`);
      }
      return value;
    })
    .sort((a, b) => a - b);
  const rank = Math.ceil(p * sorted.length) - 1;
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank))];
}

export function aggregateRuns(runs, metricKeys = PERF_METRIC_KEYS) {
  if (!Array.isArray(runs) || runs.length === 0) {
    throw new Error("aggregateRuns 需要至少一次运行结果");
  }
  const metrics = {};
  for (const key of metricKeys) {
    metrics[key] = median(runs.map((run) => run[key]));
  }
  return { metrics, runs };
}

function numericMetric(metrics, key) {
  const value = metrics?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function evaluateBudgets(metrics, options = {}) {
  const budgets = { ...PERF_BUDGETS, ...(options.budgets ?? {}) };
  const previous = options.previous ?? null;
  const checks = [];

  const checkMax = (key, limitKey = key) => {
    const actual = numericMetric(metrics, key);
    if (actual === null) {
      checks.push({ key, actual: null, limit: budgets[limitKey], pass: false, reason: "指标缺失" });
      return;
    }
    checks.push({
      key,
      actual,
      limit: budgets[limitKey],
      pass: actual <= budgets[limitKey],
      reason: actual <= budgets[limitKey] ? null : `超过阈值 ${budgets[limitKey]}`,
    });
  };

  checkMax("lcpMs");
  checkMax("cls");
  checkMax("ttfbMs");
  checkMax("interactionMs");
  checkMax("maxLongTaskMs");
  checkMax("scrollP95FrameMs");
  checkMax("scrollDroppedFrameRatio");

  const currentJs = numericMetric(metrics, "jsEncodedBytes");
  const previousJs = numericMetric(previous, "jsEncodedBytes");
  if (currentJs === null) {
    checks.push({
      key: "jsEncodedBytes",
      actual: null,
      limit: budgets.jsGrowthRatio,
      pass: false,
      reason: "指标缺失",
    });
  } else if (previousJs === null || previousJs <= 0) {
    checks.push({
      key: "jsEncodedBytes",
      actual: currentJs,
      limit: budgets.jsGrowthRatio,
      pass: true,
      reason: "无上一基线，仅记录",
    });
  } else {
    const growth = (currentJs - previousJs) / previousJs;
    checks.push({
      key: "jsEncodedBytes",
      actual: currentJs,
      limit: budgets.jsGrowthRatio,
      pass: growth <= budgets.jsGrowthRatio,
      reason:
        growth <= budgets.jsGrowthRatio
          ? null
          : `较上一基线增长 ${(growth * 100).toFixed(1)}%，超过 ${(budgets.jsGrowthRatio * 100).toFixed(0)}%`,
    });
  }

  const violations = checks.filter((check) => !check.pass);
  return { pass: violations.length === 0, checks, violations };
}

export function createPerfManifest({
  version,
  baseUrl,
  commit = null,
  capturedAt = new Date().toISOString(),
  environment = {},
  entries,
  budgets = PERF_BUDGETS,
}) {
  if (typeof version !== "string" || !SEMVER_RE.test(version)) {
    throw new Error("manifest 缺少合法 version（semver）");
  }
  if (typeof baseUrl !== "string" || !/^https?:\/\//.test(baseUrl)) {
    throw new Error("manifest 缺少合法 baseUrl");
  }
  if (!Array.isArray(entries)) {
    throw new Error("manifest 缺少 entries 数组");
  }
  return {
    schemaVersion: 1,
    kind: "mobile-performance",
    baselineVersion: version,
    capturedAt,
    baseUrl,
    commit,
    environment,
    budgets,
    summary: {
      total: entries.length,
      passed: entries.filter((entry) => entry.pass).length,
      failed: entries.filter((entry) => !entry.pass).length,
    },
    entries,
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function validatePerfManifest(manifest, options = {}) {
  const allowEmpty = options.allowEmpty === true;
  const errors = [];

  if (!isPlainObject(manifest)) return { valid: false, errors: ["manifest 必须是对象"] };
  if (manifest.schemaVersion !== 1) errors.push("schemaVersion 必须为 1");
  if (manifest.kind !== "mobile-performance") errors.push("kind 必须为 mobile-performance");
  if (typeof manifest.baselineVersion !== "string" || !SEMVER_RE.test(manifest.baselineVersion)) {
    errors.push("baselineVersion 必须是 semver");
  }
  if (typeof manifest.capturedAt !== "string" || Number.isNaN(Date.parse(manifest.capturedAt))) {
    errors.push("capturedAt 必须是可解析的 ISO 时间");
  }
  if (typeof manifest.baseUrl !== "string" || !/^https?:\/\//.test(manifest.baseUrl)) {
    errors.push("baseUrl 必须是 http(s) 地址");
  }
  if (!Array.isArray(manifest.entries)) {
    errors.push("entries 必须是数组");
    return { valid: false, errors };
  }
  if (!allowEmpty && manifest.entries.length === 0) {
    errors.push("entries 不能为空（模板请显式传 allowEmpty）");
  }

  const ids = new Set();
  manifest.entries.forEach((entry, index) => {
    const prefix = `entries[${index}]`;
    if (!isPlainObject(entry)) {
      errors.push(`${prefix} 必须是对象`);
      return;
    }
    if (typeof entry.id !== "string" || !entry.id) {
      errors.push(`${prefix}.id 缺失`);
    } else if (ids.has(entry.id)) {
      errors.push(`${prefix}.id 重复: ${entry.id}`);
    } else {
      ids.add(entry.id);
    }
    if (typeof entry.profile !== "string" || !entry.profile) errors.push(`${prefix}.profile 缺失`);
    if (typeof entry.page !== "string" || !entry.page) errors.push(`${prefix}.page 缺失`);
    if (typeof entry.path !== "string" || !entry.path.startsWith("/")) {
      errors.push(`${prefix}.path 必须以 / 开头`);
    }
    if (!Number.isInteger(entry.runs) || entry.runs < 1) errors.push(`${prefix}.runs 非法`);
    if (!isPlainObject(entry.metrics)) {
      errors.push(`${prefix}.metrics 缺失`);
    } else {
      for (const key of PERF_METRIC_KEYS) {
        if (typeof entry.metrics[key] !== "number" || !Number.isFinite(entry.metrics[key])) {
          errors.push(`${prefix}.metrics.${key} 必须是有限数值`);
        }
      }
    }
    if (!isPlainObject(entry.budgets) || typeof entry.budgets.pass !== "boolean") {
      errors.push(`${prefix}.budgets 缺失或缺少 pass`);
    }
    if (typeof entry.pass !== "boolean") errors.push(`${prefix}.pass 必须是布尔值`);
  });

  return { valid: errors.length === 0, errors };
}

export function summarizeSmokeResults(results) {
  if (!Array.isArray(results)) throw new Error("results 必须是数组");
  const counts = { pass: 0, fail: 0, skipped: 0 };
  for (const result of results) {
    if (!result || !["pass", "fail", "skipped"].includes(result.status)) {
      throw new Error(`非法冒烟结果状态: ${JSON.stringify(result)}`);
    }
    counts[result.status] += 1;
  }
  return {
    total: results.length,
    passed: counts.pass,
    failed: counts.fail,
    skipped: counts.skipped,
    pass: counts.fail === 0 && counts.pass > 0,
  };
}

export function createSmokeManifest({
  version,
  baseUrl,
  commit = null,
  capturedAt = new Date().toISOString(),
  environment = {},
  results,
}) {
  if (typeof version !== "string" || !SEMVER_RE.test(version)) {
    throw new Error("冒烟记录缺少合法 version");
  }
  if (!Array.isArray(results)) throw new Error("冒烟记录缺少 results");
  const summary = summarizeSmokeResults(results);
  return {
    schemaVersion: 1,
    kind: "mobile-smoke",
    baselineVersion: version,
    capturedAt,
    baseUrl,
    commit,
    environment,
    summary,
    results,
  };
}

function requireValue(argv, index, flag) {
  const value = argv[index + 1];
  if (typeof value !== "string" || value.startsWith("--")) {
    throw new Error(`${flag} 缺少参数值`);
  }
  return value;
}

function parseList(value, flag) {
  const list = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (list.length === 0) throw new Error(`${flag} 不能为空`);
  return [...new Set(list)];
}

export function parsePerfArgs(argv = []) {
  const options = {
    baseUrl: "http://127.0.0.1:3000",
    version: null,
    outDir: null,
    profiles: PERF_PROFILES.map((item) => item.key),
    pages: PERF_PAGES.map((item) => item.key),
    runs: 3,
    mock: true,
    dryRun: false,
    help: false,
    previous: null,
    chromiumPath: process.env.CHROMIUM_PATH ?? null,
    timeoutMs: 60_000,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    switch (flag) {
      case "--base-url": {
        const value = requireValue(argv, index, flag);
        if (!/^https?:\/\//.test(value)) throw new Error("--base-url 必须是 http(s) 地址");
        options.baseUrl = value.replace(/\/+$/, "");
        index += 1;
        break;
      }
      case "--version": {
        const value = requireValue(argv, index, flag);
        if (!SEMVER_RE.test(value)) throw new Error("--version 必须是 semver，如 0.1.69");
        options.version = value;
        index += 1;
        break;
      }
      case "--out":
        options.outDir = requireValue(argv, index, flag);
        index += 1;
        break;
      case "--profiles":
        options.profiles = parseList(requireValue(argv, index, flag), flag).map(
          (key) => getPerfProfile(key).key,
        );
        index += 1;
        break;
      case "--pages":
        options.pages = parseList(requireValue(argv, index, flag), flag).map(
          (key) => getPerfPage(key).key,
        );
        index += 1;
        break;
      case "--runs": {
        const value = Number.parseInt(requireValue(argv, index, flag), 10);
        if (!Number.isInteger(value) || value < 1 || value > 10) {
          throw new Error("--runs 必须是 1-10 的整数");
        }
        options.runs = value;
        index += 1;
        break;
      }
      case "--previous":
        options.previous = requireValue(argv, index, flag);
        index += 1;
        break;
      case "--chromium-path":
        options.chromiumPath = requireValue(argv, index, flag);
        index += 1;
        break;
      case "--timeout": {
        const value = Number.parseInt(requireValue(argv, index, flag), 10);
        if (!Number.isFinite(value) || value <= 0) throw new Error("--timeout 必须是正整数毫秒");
        options.timeoutMs = value;
        index += 1;
        break;
      }
      case "--no-mock":
        options.mock = false;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new Error(`未知参数: ${flag}`);
    }
  }

  return options;
}

export function parseSmokeArgs(argv = []) {
  const options = {
    baseUrl: "http://127.0.0.1:3000",
    version: null,
    outDir: null,
    mock: true,
    dryRun: false,
    help: false,
    chromiumPath: process.env.CHROMIUM_PATH ?? null,
    timeoutMs: 45_000,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    switch (flag) {
      case "--base-url": {
        const value = requireValue(argv, index, flag);
        if (!/^https?:\/\//.test(value)) throw new Error("--base-url 必须是 http(s) 地址");
        options.baseUrl = value.replace(/\/+$/, "");
        index += 1;
        break;
      }
      case "--version": {
        const value = requireValue(argv, index, flag);
        if (!SEMVER_RE.test(value)) throw new Error("--version 必须是 semver，如 0.1.69");
        options.version = value;
        index += 1;
        break;
      }
      case "--out":
        options.outDir = requireValue(argv, index, flag);
        index += 1;
        break;
      case "--chromium-path":
        options.chromiumPath = requireValue(argv, index, flag);
        index += 1;
        break;
      case "--timeout": {
        const value = Number.parseInt(requireValue(argv, index, flag), 10);
        if (!Number.isFinite(value) || value <= 0) throw new Error("--timeout 必须是正整数毫秒");
        options.timeoutMs = value;
        index += 1;
        break;
      }
      case "--no-mock":
        options.mock = false;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new Error(`未知参数: ${flag}`);
    }
  }

  return options;
}

export const PERF_HELP_TEXT = `移动端性能基线采集工具

用法:
  npm run perf:mobile -- [options]

选项:
  --base-url <url>        目标地址，默认 http://127.0.0.1:3000
  --version <semver>      基线版本，默认读取 package.json
  --out <dir>             输出目录，默认 docs/visual-baseline/performance/<version>
  --profiles <list>       mobile-standard,mobile-low-end（默认两者）
  --pages <list>          home,room（默认两者）
  --runs <n>              每个测量项运行次数，默认 3
  --previous <manifest>   上一版 manifest，用于首屏 JS 增长对比
  --chromium-path <path>  Chromium / Chrome 可执行文件；也可用 CHROMIUM_PATH
  --timeout <ms>          单页超时，默认 60000
  --no-mock               使用真实后端（默认拦截 /api/** 返回固定演示数据）
  --dry-run               只打印测量矩阵，不启动浏览器
  --help                  显示本帮助
`;

export const SMOKE_HELP_TEXT = `移动端核心流程冒烟工具

在 Chromium 移动端模拟器（390×844 / DPR 3 / 触摸）中依次验证四条 P0 流程：
加入房间、发送文本、上传并发送文件、打开 / 关闭房间抽屉。

用法:
  npm run smoke:mobile -- [options]

选项:
  --base-url <url>        目标地址，默认 http://127.0.0.1:3000
  --version <semver>      基线版本，默认读取 package.json
  --out <dir>             输出目录，默认 docs/visual-baseline/performance/<version>
  --chromium-path <path>  Chromium / Chrome 可执行文件；也可用 CHROMIUM_PATH
  --timeout <ms>          单流程超时，默认 45000
  --no-mock               使用真实后端（默认拦截 /api/** 返回固定演示数据）
  --dry-run               只打印流程列表，不启动浏览器
  --help                  显示本帮助
`;
