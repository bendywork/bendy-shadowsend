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
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const DEMO_OWNER = Object.freeze({
  id: "user-demo-owner",
  nickname: "演示房主",
  avatarInitial: "演",
  avatarColor: "#52525b",
});

const DEMO_MEMBER = Object.freeze({
  id: "user-demo-member",
  nickname: "视觉验收员",
  avatarInitial: "视",
  avatarColor: "#71717a",
});

const DEMO_PENDING = Object.freeze({
  id: "user-demo-pending",
  nickname: "等待审批的用户",
  avatarInitial: "等",
  avatarColor: "#a1a1aa",
});

const DEMO_APP = Object.freeze({
  name: "临时笨迪",
  version: "0.1.69",
  openSource: "MIT",
});

const DEMO_BOOTSTRAP = Object.freeze({
  app: DEMO_APP,
  me: DEMO_OWNER,
  tree: {
    createdRooms: [
      {
        id: "room-demo",
        roomCode: "DEMO01",
        name: "视觉验收演示房间",
        ownerId: DEMO_OWNER.id,
        hasGateCode: true,
        gateCodeExpiresAt: "2026-10-18T12:00:00.000Z",
        createdAt: "2026-10-18T01:00:00.000Z",
        role: "OWNER",
      },
    ],
    joinedRooms: [],
  },
  stats: { totalOnline: 12 },
});

const DEMO_ROOM = Object.freeze({
  app: DEMO_APP,
  room: {
    id: "room-demo",
    roomCode: "DEMO01",
    name: "视觉验收演示房间",
    ownerId: DEMO_OWNER.id,
    owner: DEMO_OWNER,
    hasGateCode: true,
    gateCodeExpiresAt: "2026-10-18T12:00:00.000Z",
    gateCode: "123456",
    neverExpire: false,
    allowJoinRequest: true,
  },
  announcement: {
    text: "欢迎来到视觉验收演示房间。请按 docs/visual-acceptance-checklist.md 逐项检查双主题与三断点。",
    imageUrl: "/1.png",
    imageName: "announcement.png",
    images: [{ imageUrl: "/1.png", imageName: "announcement.png" }],
    updatedAt: "2026-10-18T02:00:00.000Z",
    showToMe: false,
  },
  me: { ...DEMO_OWNER, role: "OWNER" },
  members: [
    {
      id: "member-owner",
      userId: DEMO_OWNER.id,
      role: "OWNER",
      status: "ACTIVE",
      joinedAt: "2026-10-18T01:00:00.000Z",
      lastSeenAt: "2026-10-18T02:10:00.000Z",
      user: DEMO_OWNER,
    },
    {
      id: "member-member",
      userId: DEMO_MEMBER.id,
      role: "MEMBER",
      status: "ACTIVE",
      joinedAt: "2026-10-18T01:05:00.000Z",
      lastSeenAt: "2026-10-18T02:09:00.000Z",
      user: DEMO_MEMBER,
    },
  ],
  pendingRequests: [
    {
      id: "request-pending",
      userId: DEMO_PENDING.id,
      status: "PENDING",
      reason: "想加入查看视觉验收演示。",
      createdAt: "2026-10-18T02:05:00.000Z",
      user: DEMO_PENDING,
    },
  ],
  messages: [
    {
      id: "message-text",
      roomId: "room-demo",
      type: "TEXT",
      content: "这是第一条演示消息，用于检查气泡、时间戳与发送者信息。",
      createdAt: "2026-10-18T02:01:00.000Z",
      sender: DEMO_MEMBER,
      attachments: [],
    },
    {
      id: "message-file",
      roomId: "room-demo",
      type: "FILE",
      content: "",
      createdAt: "2026-10-18T02:02:00.000Z",
      sender: DEMO_MEMBER,
      attachments: [
        {
          id: "attachment-file",
          fileName: "视觉验收清单.pdf",
          mimeType: "application/pdf",
          sizeBytes: 348160,
          storage: "S3",
          previewType: "NONE",
          previewUrl: null,
          createdAt: "2026-10-18T02:02:00.000Z",
        },
      ],
    },
    {
      id: "message-mixed",
      roomId: "room-demo",
      type: "MIXED",
      content: "附上一张示意图，检查图片附件与混合消息布局。",
      createdAt: "2026-10-18T02:03:00.000Z",
      sender: DEMO_OWNER,
      attachments: [
        {
          id: "attachment-image",
          fileName: "design-token.png",
          mimeType: "image/png",
          sizeBytes: 102400,
          storage: "S3",
          previewType: "IMAGE",
          previewUrl: "/1.png",
          createdAt: "2026-10-18T02:03:00.000Z",
        },
      ],
    },
  ],
  stats: { roomOnline: 2, totalOnline: 12 },
  // 故意保留彩色 color 字段：截图应验证广告位忽略它，仍显示黑白灰。
  adBoard: {
    items: [
      { content: "视觉验收基线 · 双主题 × 三断点", color: "#0a84ff", url: "https://example.com" },
      { content: "黑白灰纪律 · 语义状态色除外", color: "#0071e3", url: "" },
    ],
    maxContentChars: 120,
  },
});

function jsonResponse(route, data) {
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, data }),
  });
}

async function installMockApi(context) {
  await context.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;

    if (pathname === "/api/me") {
      await jsonResponse(route, { user: DEMO_OWNER });
      return;
    }
    if (pathname === "/api/bootstrap") {
      await jsonResponse(route, DEMO_BOOTSTRAP);
      return;
    }
    if (/^\/api\/rooms\/[^/]+$/.test(pathname)) {
      await jsonResponse(route, DEMO_ROOM);
      return;
    }
    if (/^\/api\/rooms\/[^/]+\/messages$/.test(pathname)) {
      await jsonResponse(route, { messages: [] });
      return;
    }
    if (pathname === "/api/presence") {
      await jsonResponse(route, { success: true });
      return;
    }
    await jsonResponse(route, { success: true });
  });
}

function isUsableChromium(candidate) {
  try {
    const output = execFileSync(candidate, ["--version"], {
      encoding: "utf8",
      timeout: 5000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return /\b(Chrome|Chromium)\b/i.test(output);
  } catch {
    // snap 占位脚本等会在这里返回非零，直接跳过。
    return false;
  }
}

function findChromium(explicitPath) {
  const candidates = [
    explicitPath,
    process.env.CHROMIUM_PATH,
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (existsSync(candidate) && isUsableChromium(candidate)) return candidate;
  }

  // 复用 Playwright 已下载的 headless shell（如果存在）。
  const cacheRoot = path.join(homedir(), ".cache", "ms-playwright");
  if (existsSync(cacheRoot)) {
    for (const entry of readdirSync(cacheRoot)) {
      if (!entry.startsWith("chromium")) continue;
      const shells = [
        path.join(cacheRoot, entry, "chrome-headless-shell-linux64", "chrome-headless-shell"),
        path.join(cacheRoot, entry, "chrome-linux", "chrome"),
        path.join(cacheRoot, entry, "chrome-linux64", "chrome"),
      ];
      for (const shell of shells) {
        if (existsSync(shell) && isUsableChromium(shell)) return shell;
      }
    }
  }

  return null;
}

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
