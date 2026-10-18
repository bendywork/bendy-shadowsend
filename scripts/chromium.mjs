/**
 * 本机 Chromium / Chrome 定位工具。
 *
 * playwright-core 不捆绑浏览器，视觉基线与移动端验收共用同一套查找逻辑：
 * 显式参数 > 环境变量 > 系统 Chrome/Chromium > Playwright 已下载的 headless shell。
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

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

export function findChromium(explicitPath) {
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
