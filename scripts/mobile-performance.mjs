#!/usr/bin/env node
/**
 * 移动端性能基线采集器。
 *
 * 在 Chromium 移动端视口（390×844 / DPR 3）下测量首页与房间页的首屏指标，
 * 并在房间长列表上执行滚动采样。支持 CPU 4× 与 Slow 4G 的低端机档位。
 *
 * 依赖 playwright-core（不捆绑浏览器）；Chromium 路径查找与视觉基线共用。
 * 用法见 `npm run perf:mobile -- --help` 或 docs/mobile-acceptance.md §4。
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  MOBILE_VIEWPORT,
  PERF_HELP_TEXT,
  aggregateRuns,
  buildPerfPlan,
  createPerfManifest,
  evaluateBudgets,
  parsePerfArgs,
  percentile,
  validatePerfManifest,
} from "./mobile-acceptance-lib.mjs";
import { installMockApi } from "./demo-fixtures.mjs";
import { findChromium } from "./chromium.mjs";
import { ROOT, assertReachable, gitCommit, packageVersion } from "./acceptance-runtime.mjs";

async function installPerfObserver(context, theme) {
  await context.addInitScript(({ themeMode }) => {
    try {
      localStorage.setItem("tb:theme", themeMode);
      localStorage.setItem("tb:lang", "zh");
    } catch {
      /* about:blank 等环境可能不可用 */
    }

    // 房间页加载后会自动 scrollIntoView 到消息底部；性能采集时冻结该行为，
    // 让 LCP 在首屏（顶部）稳定产生，滚动专项由 measureScroll 单独执行。
    try {
      Element.prototype.scrollIntoView = function scrollIntoViewDisabled() {};
    } catch {
      /* 无法覆盖时保持原行为 */
    }

    const state = {
      lcpMs: 0,
      fcpMs: 0,
      cls: 0,
      longTasks: [],
      eventDurations: [],
    };
    window.__perfState = state;
    // 必须保留 observer 引用，否则 LCP 等延迟回调可能在 GC 后停止触发。
    const observers = [];
    window.__perfObservers = observers;

    const observe = (type, callback, options = {}) => {
      try {
        const observer = new PerformanceObserver(callback);
        observers.push(observer);
        observer.observe({ type, buffered: true, ...options });
      } catch {
        /* 浏览器不支持该 entry type 时忽略 */
      }
    };

    observe("largest-contentful-paint", (list) => {
      for (const entry of list.getEntries()) state.lcpMs = entry.startTime;
    });
    observe("paint", (list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === "first-contentful-paint") state.fcpMs = entry.startTime;
      }
    });
    observe("layout-shift", (list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) state.cls += entry.value;
      }
    });
    observe("longtask", (list) => {
      for (const entry of list.getEntries()) state.longTasks.push(entry.duration);
    });
    observe(
      "event",
      (list) => {
        for (const entry of list.getEntries()) {
          if (entry.interactionId) state.eventDurations.push(entry.duration);
        }
      },
      { durationThreshold: 16 },
    );
  }, { themeMode: theme });
}

async function applyProfile(client, profile) {
  await client.send("Emulation.setCPUThrottlingRate", {
    rate: profile.cpuThrottlingRate,
  });
  if (profile.network) {
    await client.send("Network.enable");
    await client.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: profile.network.latency,
      downloadThroughput: profile.network.downloadThroughput,
      uploadThroughput: profile.network.uploadThroughput,
      connectionType: "cellular4g",
    });
  }
}

async function collectFirstScreenMetrics(page) {
  return page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const state = window.__perfState ?? {
      lcpMs: 0,
      fcpMs: 0,
      cls: 0,
      longTasks: [],
      eventDurations: [],
    };
    const jsBytes = performance
      .getEntriesByType("resource")
      .filter(
        (entry) =>
          entry.initiatorType === "script" ||
          entry.name.endsWith(".js") ||
          entry.name.includes(".js?"),
      )
      .reduce((sum, entry) => sum + (entry.encodedBodySize || entry.transferSize || 0), 0);

    const longTasks = Array.isArray(state.longTasks) ? state.longTasks : [];
    const eventDurations = Array.isArray(state.eventDurations) ? state.eventDurations : [];
    return {
      lcpMs: Number(state.lcpMs) || 0,
      fcpMs: Number(state.fcpMs) || 0,
      cls: Number(state.cls) || 0,
      ttfbMs: nav ? Math.max(0, nav.responseStart - nav.startTime) : 0,
      maxLongTaskMs: longTasks.length > 0 ? Math.max(...longTasks) : 0,
      longTaskCount: longTasks.length,
      interactionMs: eventDurations.length > 0 ? Math.max(...eventDurations) : 0,
      jsEncodedBytes: jsBytes,
    };
  });
}

async function waitForLcp(page, timeoutMs) {
  await page
    .waitForFunction(() => (window.__perfState?.lcpMs ?? 0) > 0, null, {
      timeout: Math.min(timeoutMs, 15_000),
    })
    .catch(() => {
      /* 没有 LCP 时保持 0，由预算判定记录缺失 */
    });
  // 等待后续更大的 LCP 候选稳定下来，避免只采到首帧文本。
  await page.waitForTimeout(1000);
}

async function triggerInteraction(page) {
  const candidates = [
    page.locator('button[aria-label*="浅色"]').first(),
    page.locator('button[aria-label*="深色"]').first(),
    page.locator('button[aria-label*="light" i]').first(),
    page.locator('button[aria-label*="dark" i]').first(),
    page.getByRole("button", { name: "创建", exact: true }).first(),
  ];
  for (const candidate of candidates) {
    try {
      if ((await candidate.count()) === 0) continue;
      if (!(await candidate.isVisible())) continue;
      await candidate.click({ timeout: 3000 });
      await page.waitForTimeout(350);
      return true;
    } catch {
      /* 尝试下一个候选控件 */
    }
  }
  return false;
}

async function measureScroll(page) {
  const raw = await page.evaluate(async () => {
    const candidates = Array.from(document.querySelectorAll("*")).filter((element) => {
      const style = window.getComputedStyle(element);
      const scrollable = /(auto|scroll)/.test(style.overflowY);
      return scrollable && element.clientHeight >= 100 && element.scrollHeight > element.clientHeight + 200;
    });
    const internal = candidates.sort(
      (left, right) =>
        right.scrollHeight - right.clientHeight - (left.scrollHeight - left.clientHeight),
    )[0];
    // 手机端房间页使用页面级滚动（消息列表随内容展开），没有内部滚动容器时回退到
    // document.scrollingElement，保证测到的是用户真实滚动路径。
    const target = internal ?? document.scrollingElement ?? document.documentElement;
    if (!target || target.scrollHeight <= target.clientHeight + 200) {
      return { found: false, frames: [], scrollHeight: 0, clientHeight: 0 };
    }

    const frames = [];
    const nextFrame = () =>
      new Promise((resolve) => {
        requestAnimationFrame((timestamp) => resolve(timestamp));
      });

    target.scrollTop = 0;
    await nextFrame();
    let previous = await nextFrame();
    const steps = 80;
    const maxScroll = target.scrollHeight - target.clientHeight;
    for (let index = 1; index <= steps; index += 1) {
      target.scrollTop = Math.round((maxScroll * index) / steps);
      const timestamp = await nextFrame();
      frames.push(Math.max(0, timestamp - previous));
      previous = timestamp;
    }

    return {
      found: true,
      frames,
      scrollHeight: target.scrollHeight,
      clientHeight: target.clientHeight,
      selector: internal
        ? `${target.tagName.toLowerCase()}.${String(target.className ?? "")
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 3)
            .join(".")}`
        : "document.scrollingElement",
    };
  });

  if (!raw.found || raw.frames.length === 0) {
    return { ...raw, scrollP95FrameMs: 0, scrollDroppedFrameRatio: 0 };
  }
  const dropped = raw.frames.filter((frame) => frame > 1000 / 30).length;
  return {
    ...raw,
    scrollP95FrameMs: percentile(raw.frames, 0.95),
    scrollDroppedFrameRatio: dropped / raw.frames.length,
  };
}

async function measureOnce(browser, options, planEntry, runIndex) {
  const context = await browser.newContext({
    viewport: { width: MOBILE_VIEWPORT.width, height: MOBILE_VIEWPORT.height },
    deviceScaleFactor: MOBILE_VIEWPORT.deviceScaleFactor,
    isMobile: true,
    hasTouch: true,
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
    reducedMotion: "reduce",
    colorScheme: "dark",
  });

  try {
    await installPerfObserver(context, "dark");
    if (options.mock) {
      await installMockApi(context, {
        messageCount: planEntry.page.key === "room" ? 200 : 3,
      });
    }

    const page = await context.newPage();
    page.setDefaultTimeout(options.timeoutMs);
    const client = await context.newCDPSession(page);
    await applyProfile(client, planEntry.profile);

    const url = `${options.baseUrl}${planEntry.page.path}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
    await page.waitForSelector(planEntry.page.readySelector ?? "main", {
      timeout: options.timeoutMs,
    });
    await page.evaluate(() => document.fonts?.ready ?? Promise.resolve());
    await waitForLcp(page, options.timeoutMs);

    const firstScreen = await collectFirstScreenMetrics(page);
    const interacted = await triggerInteraction(page);
    const afterInteraction = interacted ? await collectFirstScreenMetrics(page) : firstScreen;
    const scroll = await measureScroll(page);

    return {
      ...firstScreen,
      interactionMs: Math.max(firstScreen.interactionMs, afterInteraction.interactionMs),
      scrollP95FrameMs: scroll.scrollP95FrameMs,
      scrollDroppedFrameRatio: scroll.scrollDroppedFrameRatio,
      scrollContainer: scroll.found ? scroll.selector : null,
      scrollHeight: scroll.scrollHeight,
      scrollClientHeight: scroll.clientHeight,
      run: runIndex + 1,
    };
  } finally {
    await context.close();
  }
}

function printPlan(plan) {
  console.log(`共 ${plan.length} 个性能测量项：`);
  for (const entry of plan) {
    console.log(
      `  - ${entry.id}  ${entry.profile.label}  运行 ${entry.runs} 次  -> ${entry.page.path}`,
    );
  }
}

async function loadPrevious(file) {
  if (!file) return null;
  const manifest = JSON.parse(readFileSync(path.resolve(ROOT, file), "utf8"));
  const validation = validatePerfManifest(manifest, { allowEmpty: true });
  if (!validation.valid) {
    throw new Error(`上一基线 manifest 校验失败: ${validation.errors.join("; ")}`);
  }
  return new Map(manifest.entries.map((entry) => [entry.id, entry.metrics]));
}

async function main() {
  let options;
  try {
    options = parsePerfArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`参数错误: ${error.message}`);
    console.error("使用 --help 查看用法。");
    process.exit(2);
  }

  if (options.help) {
    console.log(PERF_HELP_TEXT);
    return;
  }

  const version = options.version ?? packageVersion();
  if (!version) {
    console.error("无法确定版本号，请用 --version 指定。");
    process.exit(2);
  }

  const plan = buildPerfPlan({
    profiles: options.profiles,
    pages: options.pages,
    runs: options.runs,
  });
  const outDir = path.resolve(
    ROOT,
    options.outDir ?? path.join("docs", "visual-baseline", "performance", version),
  );
  printPlan(plan);
  console.log(`输出目录: ${outDir}`);

  if (options.dryRun) {
    console.log("--dry-run：未启动浏览器，未写入文件。");
    return;
  }

  await assertReachable(options.baseUrl);
  const executablePath = findChromium(options.chromiumPath);
  if (!executablePath) {
    console.error(
      "未找到 Chromium。请安装 Chrome/Chromium，或设置 CHROMIUM_PATH，或用 --chromium-path 指定可执行文件。",
    );
    process.exit(2);
  }

  let chromium;
  try {
    ({ chromium } = await import("playwright-core"));
  } catch {
    console.error("未安装 playwright-core。请运行 `npm install -D playwright-core` 后重试。");
    process.exit(2);
  }

  const previous = await loadPrevious(options.previous);
  mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--force-device-scale-factor=1"],
  });
  const browserVersion = browser.version();
  const entries = [];

  try {
    for (const planEntry of plan) {
      const runs = [];
      for (let runIndex = 0; runIndex < planEntry.runs; runIndex += 1) {
        process.stdout.write(`  · ${planEntry.id} 第 ${runIndex + 1}/${planEntry.runs} 次 ... `);
        try {
          const result = await measureOnce(browser, options, planEntry, runIndex);
          runs.push(result);
          console.log("ok");
        } catch (error) {
          console.log(`失败: ${error.message}`);
          runs.push(null);
        }
      }

      const validRuns = runs.filter(Boolean);
      if (validRuns.length === 0) {
        console.error(`  ✗ ${planEntry.id}: 全部运行失败`);
        entries.push({
          id: planEntry.id,
          profile: planEntry.profile.key,
          page: planEntry.page.key,
          path: planEntry.page.path,
          runs: planEntry.runs,
          samples: [],
          metrics: Object.fromEntries(
            ["lcpMs", "fcpMs", "ttfbMs", "cls", "interactionMs", "maxLongTaskMs", "longTaskCount", "jsEncodedBytes", "scrollP95FrameMs", "scrollDroppedFrameRatio"].map(
              (key) => [key, 0],
            ),
          ),
          budgets: { pass: false, checks: [], violations: [{ reason: "全部运行失败" }] },
          pass: false,
        });
        continue;
      }

      const aggregate = aggregateRuns(validRuns);
      const previousMetrics = previous?.get(planEntry.id) ?? null;
      const budgets = evaluateBudgets(aggregate.metrics, { previous: previousMetrics });
      entries.push({
        id: planEntry.id,
        profile: planEntry.profile.key,
        page: planEntry.page.key,
        path: planEntry.page.path,
        runs: validRuns.length,
        samples: validRuns,
        metrics: aggregate.metrics,
        budgets,
        pass: budgets.pass,
      });
      console.log(
        `  ${budgets.pass ? "✓" : "✗"} ${planEntry.id}  LCP ${aggregate.metrics.lcpMs.toFixed(0)}ms  ` +
          `CLS ${aggregate.metrics.cls.toFixed(3)}  TTFB ${aggregate.metrics.ttfbMs.toFixed(0)}ms  ` +
          `滚动 p95 ${aggregate.metrics.scrollP95FrameMs.toFixed(1)}ms`,
      );
      for (const violation of budgets.violations) {
        console.error(`    - ${violation.key}: ${violation.reason ?? "超出预算"}`);
      }
    }
  } finally {
    await browser.close();
  }

  const manifest = createPerfManifest({
    version,
    baseUrl: options.baseUrl,
    commit: gitCommit(),
    environment: {
      browser: `Chromium ${browserVersion}`,
      executablePath,
      platform: process.platform,
      viewport: MOBILE_VIEWPORT,
      locale: "zh-CN",
      timezone: "Asia/Shanghai",
      reducedMotion: "reduce",
      mockApi: options.mock,
      profiles: options.profiles,
      node: process.version,
    },
    entries,
  });

  const validation = validatePerfManifest(manifest, { allowEmpty: true });
  const manifestPath = path.join(outDir, "manifest.json");
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  console.log(
    `\n完成 ${manifest.summary.passed}/${manifest.summary.total} 项，manifest: ${manifestPath}`,
  );
  if (!validation.valid) {
    console.error("manifest 校验失败：");
    for (const error of validation.errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  if (manifest.summary.failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exit(1);
});
