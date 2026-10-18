/**
 * 验收脚本共用的运行时工具：仓库根目录、版本 / 提交信息与目标地址探活。
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function gitCommit() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

export function packageVersion() {
  try {
    return JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")).version;
  } catch {
    return null;
  }
}

export async function assertReachable(baseUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(baseUrl, { signal: controller.signal });
    if (!response.ok && response.status >= 500) throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    throw new Error(
      `无法访问 ${baseUrl}（${error.message}）。请先运行 npm run build && npm start -- -p 3000。`,
    );
  } finally {
    clearTimeout(timer);
  }
}
