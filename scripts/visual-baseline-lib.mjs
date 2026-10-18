/**
 * 视觉截图基线的纯函数层：矩阵、命名、manifest 校验与 CLI 参数解析。
 * 保持无 I/O、无浏览器依赖，便于用 node:test 直接覆盖。
 */

export const THEMES = Object.freeze(["dark", "light"]);

export const BREAKPOINTS = Object.freeze({
  mobile: Object.freeze({ min: 0, max: 767 }),
  tablet: Object.freeze({ min: 768, max: 1279 }),
  desktop: Object.freeze({ min: 1280, max: Number.POSITIVE_INFINITY }),
});

export const VIEWPORTS = Object.freeze([
  Object.freeze({ name: "mobile-360", width: 360, height: 800, breakpoint: "mobile" }),
  Object.freeze({ name: "mobile-390", width: 390, height: 844, breakpoint: "mobile" }),
  Object.freeze({ name: "mobile-430", width: 430, height: 932, breakpoint: "mobile" }),
  Object.freeze({ name: "tablet-768", width: 768, height: 1024, breakpoint: "tablet" }),
  Object.freeze({ name: "tablet-834", width: 834, height: 1194, breakpoint: "tablet" }),
  Object.freeze({ name: "tablet-1024", width: 1024, height: 1366, breakpoint: "tablet" }),
  Object.freeze({ name: "desktop-1280", width: 1280, height: 800, breakpoint: "desktop" }),
  Object.freeze({ name: "desktop-1440", width: 1440, height: 900, breakpoint: "desktop" }),
  Object.freeze({ name: "desktop-1920", width: 1920, height: 1080, breakpoint: "desktop" }),
]);

export const BASELINE_VIEWPORT_NAMES = Object.freeze([
  "mobile-390",
  "tablet-834",
  "desktop-1440",
]);

export const PAGES = Object.freeze([
  Object.freeze({ key: "home", path: "/", readySelector: "main" }),
  Object.freeze({ key: "room", path: "/room/DEMO01", readySelector: "main" }),
  // Next.js 默认 404 没有 <main>，以 body 作为稳定锚点。
  Object.freeze({ key: "not-found", path: "/__visual-baseline-not-found__", readySelector: "body" }),
]);

export function getBreakpoint(width) {
  if (!Number.isFinite(width) || width < 0) {
    throw new TypeError(`视口宽度必须是 >= 0 的有限数字，收到: ${String(width)}`);
  }
  if (width <= BREAKPOINTS.mobile.max) return "mobile";
  if (width <= BREAKPOINTS.tablet.max) return "tablet";
  return "desktop";
}

export function getViewport(name) {
  const viewport = VIEWPORTS.find((item) => item.name === name);
  if (!viewport) {
    throw new Error(
      `未知视口: ${name}。可选值: ${VIEWPORTS.map((item) => item.name).join(", ")}`,
    );
  }
  return viewport;
}

export function sanitizeSegment(value, label = "segment") {
  const text = String(value ?? "").trim();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(text)) {
    throw new Error(
      `${label} 只允许小写字母、数字与连字符，且必须以字母或数字开头: ${JSON.stringify(value)}`,
    );
  }
  return text;
}

export function buildFileName(pageKey, theme, viewport) {
  const page = sanitizeSegment(pageKey, "pageKey");
  if (!THEMES.includes(theme)) {
    throw new Error(`未知主题: ${theme}。可选值: ${THEMES.join(", ")}`);
  }
  const resolved = typeof viewport === "string" ? getViewport(viewport) : viewport;
  if (!resolved || !Number.isInteger(resolved.width) || !Number.isInteger(resolved.height)) {
    throw new Error("viewport 必须包含整数 width / height");
  }
  return `${page}--${theme}--${resolved.width}x${resolved.height}.png`;
}

export function buildBaselineEntries(options = {}) {
  const pages = options.pages ?? PAGES;
  const themes = options.themes ?? THEMES;
  const viewportNames = options.viewportNames ?? BASELINE_VIEWPORT_NAMES;

  if (!Array.isArray(pages) || pages.length === 0) {
    throw new Error("pages 不能为空");
  }
  if (!Array.isArray(themes) || themes.length === 0) {
    throw new Error("themes 不能为空");
  }
  if (!Array.isArray(viewportNames) || viewportNames.length === 0) {
    throw new Error("viewportNames 不能为空");
  }

  const entries = [];
  const seen = new Set();

  for (const page of pages) {
    const pageKey = sanitizeSegment(page.key, "page.key");
    if (typeof page.path !== "string" || !page.path.startsWith("/")) {
      throw new Error(`page.path 必须以 / 开头: ${page.key}`);
    }
    for (const theme of themes) {
      if (!THEMES.includes(theme)) {
        throw new Error(`未知主题: ${theme}`);
      }
      for (const viewportName of viewportNames) {
        const viewport = getViewport(viewportName);
        const file = buildFileName(pageKey, theme, viewport);
        const id = `${pageKey}--${theme}--${viewport.name}`;
        if (seen.has(id)) {
          throw new Error(`重复的基线条目: ${id}`);
        }
        seen.add(id);
        entries.push({
          id,
          page: pageKey,
          path: page.path,
          readySelector: page.readySelector ?? "main",
          theme,
          viewport: { ...viewport },
          file,
        });
      }
    }
  }

  return entries;
}

export function createManifest({
  version,
  baseUrl,
  commit = null,
  capturedAt = new Date().toISOString(),
  environment = {},
  entries,
}) {
  if (!version || typeof version !== "string") {
    throw new Error("manifest 缺少 version");
  }
  if (!baseUrl || typeof baseUrl !== "string") {
    throw new Error("manifest 缺少 baseUrl");
  }
  if (!Array.isArray(entries)) {
    throw new Error("manifest 缺少 entries 数组");
  }
  return {
    schemaVersion: 1,
    baselineVersion: version,
    capturedAt,
    baseUrl,
    commit,
    environment,
    entries,
  };
}

const SHA256_RE = /^[a-f0-9]{64}$/;
const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

export function validateManifest(manifest, options = {}) {
  const allowEmpty = options.allowEmpty === true;
  const errors = [];

  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return { valid: false, errors: ["manifest 必须是对象"] };
  }
  if (manifest.schemaVersion !== 1) {
    errors.push("schemaVersion 必须为 1");
  }
  if (typeof manifest.baselineVersion !== "string" || !SEMVER_RE.test(manifest.baselineVersion)) {
    errors.push("baselineVersion 必须是 semver（如 0.1.69）");
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
    errors.push("entries 不能为空（模板 manifest 请显式传 allowEmpty）");
  }

  const ids = new Set();
  const files = new Set();

  manifest.entries.forEach((entry, index) => {
    const prefix = `entries[${index}]`;
    if (!entry || typeof entry !== "object") {
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
    if (typeof entry.page !== "string" || !entry.page) {
      errors.push(`${prefix}.page 缺失`);
    }
    if (typeof entry.path !== "string" || !entry.path.startsWith("/")) {
      errors.push(`${prefix}.path 必须以 / 开头`);
    }
    if (!THEMES.includes(entry.theme)) {
      errors.push(`${prefix}.theme 非法: ${String(entry.theme)}`);
    }
    if (!entry.viewport || typeof entry.viewport !== "object") {
      errors.push(`${prefix}.viewport 缺失`);
    } else {
      const { name, width, height, breakpoint } = entry.viewport;
      if (typeof name !== "string" || !name) errors.push(`${prefix}.viewport.name 缺失`);
      if (!Number.isInteger(width) || width <= 0) errors.push(`${prefix}.viewport.width 非法`);
      if (!Number.isInteger(height) || height <= 0) errors.push(`${prefix}.viewport.height 非法`);
      if (!["mobile", "tablet", "desktop"].includes(breakpoint)) {
        errors.push(`${prefix}.viewport.breakpoint 非法`);
      }
      if (Number.isInteger(width)) {
        try {
          const expected = getBreakpoint(width);
          if (breakpoint !== expected) {
            errors.push(`${prefix}.viewport.breakpoint 与宽度不符（期望 ${expected}）`);
          }
        } catch (error) {
          errors.push(`${prefix}.viewport.width 非法: ${error.message}`);
        }
      }
    }
    if (typeof entry.file !== "string" || !/^[a-z0-9-]+--(dark|light)--\d+x\d+\.png$/.test(entry.file)) {
      errors.push(`${prefix}.file 命名非法: ${String(entry.file)}`);
    } else if (files.has(entry.file)) {
      errors.push(`${prefix}.file 重复: ${entry.file}`);
    } else {
      files.add(entry.file);
    }
    if (typeof entry.sha256 !== "string" || !SHA256_RE.test(entry.sha256)) {
      errors.push(`${prefix}.sha256 必须是 64 位小写 hex`);
    }
    if (!Number.isInteger(entry.bytes) || entry.bytes <= 0) {
      errors.push(`${prefix}.bytes 必须是正整数`);
    }
  });

  return { valid: errors.length === 0, errors };
}

function requireValue(argv, index, flag) {
  const value = argv[index + 1];
  if (typeof value !== "string" || value.startsWith("--")) {
    throw new Error(`${flag} 缺少参数值`);
  }
  return value;
}

export function parseArgs(argv = []) {
  const options = {
    baseUrl: "http://127.0.0.1:3000",
    version: null,
    outDir: null,
    themes: [...THEMES],
    viewportNames: [...BASELINE_VIEWPORT_NAMES],
    fullPage: false,
    mock: true,
    dryRun: false,
    help: false,
    chromiumPath: process.env.CHROMIUM_PATH ?? null,
    timeoutMs: 30_000,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    switch (flag) {
      case "--base-url": {
        const value = requireValue(argv, index, flag);
        if (!/^https?:\/\//.test(value)) {
          throw new Error("--base-url 必须是 http(s) 地址");
        }
        options.baseUrl = value.replace(/\/+$/, "");
        index += 1;
        break;
      }
      case "--version": {
        const value = requireValue(argv, index, flag);
        if (!SEMVER_RE.test(value)) {
          throw new Error("--version 必须是 semver，如 0.1.69");
        }
        options.version = value;
        index += 1;
        break;
      }
      case "--out": {
        options.outDir = requireValue(argv, index, flag);
        index += 1;
        break;
      }
      case "--themes": {
        const values = requireValue(argv, index, flag)
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);
        if (values.length === 0) throw new Error("--themes 不能为空");
        for (const value of values) {
          if (!THEMES.includes(value)) throw new Error(`--themes 含未知主题: ${value}`);
        }
        options.themes = [...new Set(values)];
        index += 1;
        break;
      }
      case "--viewports": {
        const values = requireValue(argv, index, flag)
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);
        if (values.length === 0) throw new Error("--viewports 不能为空");
        options.viewportNames = [...new Set(values.map((name) => getViewport(name).name))];
        index += 1;
        break;
      }
      case "--chromium-path": {
        options.chromiumPath = requireValue(argv, index, flag);
        index += 1;
        break;
      }
      case "--timeout": {
        const value = Number.parseInt(requireValue(argv, index, flag), 10);
        if (!Number.isFinite(value) || value <= 0) throw new Error("--timeout 必须是正整数毫秒");
        options.timeoutMs = value;
        index += 1;
        break;
      }
      case "--full-page":
        options.fullPage = true;
        break;
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

export const HELP_TEXT = `视觉截图基线采集工具

用法:
  npm run visual:baseline -- [options]

选项:
  --base-url <url>        目标地址，默认 http://127.0.0.1:3000
  --version <semver>      基线版本，默认读取 package.json
  --out <dir>             输出目录，默认 docs/visual-baseline/<version>
  --themes <list>         dark,light（默认两者）
  --viewports <list>      mobile-390,tablet-834,desktop-1440（默认）
  --chromium-path <path>  Chromium / Chrome 可执行文件；也可用 CHROMIUM_PATH 环境变量
  --timeout <ms>          单页超时，默认 30000
  --full-page             截取整页（默认仅视口）
  --no-mock               使用真实后端（默认拦截 /api/** 返回固定演示数据）
  --dry-run               只打印采集矩阵，不启动浏览器
  --help                  显示本帮助
`;
