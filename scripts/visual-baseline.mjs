#!/usr/bin/env node
/**
 * 视觉截图基线采集器。
 *
 * 依赖 playwright-core（不捆绑浏览器）；通过 CHROMIUM_PATH 或 --chromium-path
 * 指定本机 Chromium / Chrome。默认拦截 /api/** 返回固定演示数据，保证截图可复现。
 *
 * 用法见 `npm run visual:baseline -- --help` 或 docs/visual-acceptance-checklist.md §8。
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  HELP_TEXT,
  PAGES,
  buildBaselineEntries,
  buildFileName,
  createManifest,
  parseArgs,
  validateManifest,
} from "./visual-baseline-lib.mjs";
import { installMockApi } from "./demo-fixtures.mjs";
import { findChromium } from "./chromium.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function gitCommit() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function packageVersion() {
  try {
    return JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")).version;
  } catch {
    return null;
  }
}

async function assertReachable(baseUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(baseUrl, { signal: controller.signal });
    if (!response.ok && response.status >= 500) {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    throw new Error(
      `无法访问 ${baseUrl}（${error.message}）。请先运行 npm run build && npm start -- -p 3000。`,
    );
  } finally {
    clearTimeout(timer);
  }
}

function printMatrix(entries) {
  console.log(`共 ${entries.length} 个采集项：`);
  for (const entry of entries) {
    console.log(`  - ${entry.id}  ->  ${entry.file}`);
  }
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`参数错误: ${error.message}`);
    console.error("使用 --help 查看用法。");
    process.exit(2);
  }

  if (options.help) {
    console.log(HELP_TEXT);
    return;
  }

  const version = options.version ?? packageVersion();
  if (!version) {
    console.error("无法确定版本号，请用 --version 指定。");
    process.exit(2);
  }

  const pages = PAGES;
  const entries = buildBaselineEntries({
    pages,
    themes: options.themes,
    viewportNames: options.viewportNames,
  });
  const outDir = path.resolve(ROOT, options.outDir ?? path.join("docs", "visual-baseline", version));

  printMatrix(entries);
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
    console.error(
      "未安装 playwright-core。请运行 `npm install -D playwright-core`，然后重新执行本命令。",
    );
    process.exit(2);
  }

  mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--force-device-scale-factor=1"],
  });
  const browserVersion = browser.version();

  const captured = [];
  const failures = [];

  try {
    for (const entry of entries) {
      const context = await browser.newContext({
        viewport: { width: entry.viewport.width, height: entry.viewport.height },
        deviceScaleFactor: 1,
        locale: "zh-CN",
        timezoneId: "Asia/Shanghai",
        reducedMotion: "reduce",
        colorScheme: entry.theme,
      });

      try {
        await context.addInitScript(
          ({ theme }) => {
            try {
              localStorage.setItem("tb:theme", theme);
              localStorage.setItem("tb:lang", "zh");
            } catch {
              /* about:blank 等环境可能不可用 */
            }
          },
          { theme: entry.theme },
        );

        if (options.mock) {
          await installMockApi(context);
        }

        const page = await context.newPage();
        page.setDefaultTimeout(options.timeoutMs);

        const url = `${options.baseUrl}${entry.path}`;
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: options.timeoutMs });
        await page.waitForSelector(entry.readySelector ?? "main", { timeout: options.timeoutMs });
        await page.evaluate(() => document.fonts?.ready ?? Promise.resolve());
        await page.waitForTimeout(700);

        const actualTheme = await page.evaluate(() =>
          document.documentElement.getAttribute("data-theme"),
        );
        if (actualTheme !== entry.theme) {
          throw new Error(`主题未生效：期望 ${entry.theme}，实际 ${actualTheme}`);
        }

        const filePath = path.join(outDir, entry.file);
        await page.screenshot({ path: filePath, fullPage: options.fullPage });
        const buffer = readFileSync(filePath);

        captured.push({
          ...entry,
          file: buildFileName(entry.page, entry.theme, entry.viewport),
          sha256: createHash("sha256").update(buffer).digest("hex"),
          bytes: statSync(filePath).size,
        });
        console.log(`  ✓ ${entry.file}`);
      } catch (error) {
        failures.push({ id: entry.id, message: error.message });
        console.error(`  ✗ ${entry.id}: ${error.message}`);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  const manifest = createManifest({
    version,
    baseUrl: options.baseUrl,
    commit: gitCommit(),
    environment: {
      browser: `Chromium ${browserVersion}`,
      executablePath,
      platform: process.platform,
      locale: "zh-CN",
      timezone: "Asia/Shanghai",
      deviceScaleFactor: 1,
      reducedMotion: "reduce",
      mockApi: options.mock,
      fullPage: options.fullPage,
      node: process.version,
    },
    entries: captured,
  });

  const validation = validateManifest(manifest, { allowEmpty: true });
  const manifestPath = path.join(outDir, "manifest.json");
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  console.log(`\n完成 ${captured.length}/${entries.length} 张，manifest: ${manifestPath}`);
  if (!validation.valid) {
    console.error("manifest 校验失败：");
    for (const error of validation.errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  if (failures.length > 0) {
    console.error(`\n${failures.length} 个采集项失败：`);
    for (const failure of failures) console.error(`  - ${failure.id}: ${failure.message}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exit(1);
});
