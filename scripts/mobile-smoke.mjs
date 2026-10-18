#!/usr/bin/env node
/**
 * 移动端核心流程冒烟。
 *
 * 在 Chromium 移动端模拟器（390×844 / DPR 3 / 触摸）中验证四条 P0 流程：
 * 加入房间、发送文本、上传并发送文件、打开 / 关闭房间抽屉。
 * 每条流程使用独立浏览器上下文，避免前一条失败影响后续判定。
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  MOBILE_VIEWPORT,
  SMOKE_FLOWS,
  SMOKE_HELP_TEXT,
  createSmokeManifest,
  parseSmokeArgs,
} from "./mobile-acceptance-lib.mjs";
import { installMockApi } from "./demo-fixtures.mjs";
import { findChromium } from "./chromium.mjs";
import { ROOT, assertReachable, gitCommit, packageVersion } from "./acceptance-runtime.mjs";

const UPLOAD_FILE = Object.freeze({
  name: "mobile-smoke.png",
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  ),
});

function newContext(browser) {
  return browser.newContext({
    viewport: { width: MOBILE_VIEWPORT.width, height: MOBILE_VIEWPORT.height },
    deviceScaleFactor: MOBILE_VIEWPORT.deviceScaleFactor,
    isMobile: true,
    hasTouch: true,
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
    reducedMotion: "reduce",
    colorScheme: "dark",
  });
}

async function openRoom(page, options) {
  await page.goto(`${options.baseUrl}/room/DEMO01`, {
    waitUntil: "domcontentloaded",
    timeout: options.timeoutMs,
  });
  await page.waitForSelector("main", { timeout: options.timeoutMs });
  await page.waitForSelector('textarea[placeholder*="输入框支持"]', {
    timeout: options.timeoutMs,
  });
}

async function joinRoom(page, options) {
  await page.goto(`${options.baseUrl}/`, {
    waitUntil: "domcontentloaded",
    timeout: options.timeoutMs,
  });
  await page.waitForSelector("main", { timeout: options.timeoutMs });
  await page.getByPlaceholder("例如：8DK1A2M7QX").fill("DEMO01");
  await page.getByRole("button", { name: "进入房间", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/room/DEMO01", {
    timeout: options.timeoutMs,
  });
  await page.waitForSelector('textarea[placeholder*="输入框支持"]', {
    timeout: options.timeoutMs,
  });
}

async function sendText(page, options) {
  await openRoom(page, options);
  const text = `移动端冒烟消息 ${Date.now()}`;
  await page.locator('textarea[placeholder*="输入框支持"]').fill(text);
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await page.getByText(text, { exact: true }).first().waitFor({ timeout: options.timeoutMs });
}

async function uploadAndSend(page, options) {
  await openRoom(page, options);
  await page.locator('form input[type="file"]').setInputFiles(UPLOAD_FILE);
  await page.locator("form").getByText(UPLOAD_FILE.name, { exact: true }).waitFor({
    timeout: options.timeoutMs,
  });
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await page.waitForFunction(
    (name) => !document.querySelector("form")?.textContent?.includes(name),
    UPLOAD_FILE.name,
    { timeout: options.timeoutMs },
  );
  await page.getByText(UPLOAD_FILE.name, { exact: true }).first().waitFor({
    timeout: options.timeoutMs,
  });
}

async function toggleDrawer(page, options) {
  await openRoom(page, options);
  const hideButton = page.getByRole("button", { name: "隐藏导航栏", exact: true });
  await hideButton.waitFor({ timeout: options.timeoutMs });
  await hideButton.click();
  const showButton = page.getByRole("button", { name: "显示导航栏", exact: true });
  await showButton.waitFor({ timeout: options.timeoutMs });
  if (await page.locator("aside").first().isVisible()) {
    throw new Error("点击隐藏后房间导航仍然可见");
  }
  await showButton.click();
  await page.getByRole("button", { name: "隐藏导航栏", exact: true }).waitFor({
    timeout: options.timeoutMs,
  });
  if (!(await page.locator("aside").first().isVisible())) {
    throw new Error("点击显示后房间导航未恢复");
  }
}

const FLOW_RUNNERS = Object.freeze({
  "join-room": joinRoom,
  chat: sendText,
  upload: uploadAndSend,
  drawer: toggleDrawer,
});

async function runFlow(browser, options, flow, outDir) {
  const startedAt = Date.now();
  const context = await newContext(browser);
  try {
    if (options.mock) await installMockApi(context, { messageCount: 3 });
    const page = await context.newPage();
    page.setDefaultTimeout(options.timeoutMs);
    await FLOW_RUNNERS[flow.key](page, options);
    return {
      key: flow.key,
      label: flow.label,
      priority: flow.priority,
      status: "pass",
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    try {
      const page = context.pages()[0];
      if (page) {
        const screenshot = `smoke-failure-${flow.key}.png`;
        await page.screenshot({ path: path.join(outDir, screenshot) });
      }
    } catch {
      /* 失败现场截图失败时不覆盖原始错误 */
    }
    return {
      key: flow.key,
      label: flow.label,
      priority: flow.priority,
      status: "fail",
      durationMs: Date.now() - startedAt,
      error: error.message,
    };
  } finally {
    await context.close();
  }
}

async function main() {
  let options;
  try {
    options = parseSmokeArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`参数错误: ${error.message}`);
    console.error("使用 --help 查看用法。");
    process.exit(2);
  }

  if (options.help) {
    console.log(SMOKE_HELP_TEXT);
    return;
  }

  const version = options.version ?? packageVersion();
  if (!version) {
    console.error("无法确定版本号，请用 --version 指定。");
    process.exit(2);
  }

  console.log("移动端核心流程冒烟：");
  for (const flow of SMOKE_FLOWS) console.log(`  - [${flow.priority}] ${flow.label} (${flow.key})`);

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

  const outDir = path.resolve(
    ROOT,
    options.outDir ?? path.join("docs", "visual-baseline", "performance", version),
  );
  mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const browserVersion = browser.version();
  const results = [];

  try {
    for (const flow of SMOKE_FLOWS) {
      process.stdout.write(`  · ${flow.label} ... `);
      const result = await runFlow(browser, options, flow, outDir);
      results.push(result);
      console.log(result.status === "pass" ? "PASS" : `FAIL: ${result.error}`);
    }
  } finally {
    await browser.close();
  }

  const manifest = createSmokeManifest({
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
      node: process.version,
    },
    results,
  });
  const manifestPath = path.join(outDir, "smoke.json");
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  console.log(
    `\n${manifest.summary.pass ? "PASS" : "FAIL"} ${manifest.summary.passed}/${manifest.summary.total} 条流程通过，记录: ${manifestPath}`,
  );
  if (!manifest.summary.pass) process.exit(1);
}

main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exit(1);
});
