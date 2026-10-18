#!/usr/bin/env node
/**
 * 发布 tag 工具（REQ-202610-1374）
 *
 * 规则：
 * - 每次发布推送（合并到 master 并触发 Vercel 部署）都必须发布对应 tag；
 * - 本项目部署在 Vercel，所有 tag 一律以 `-ver` 结尾；
 * - 正常版本：<version>-ver，例如 0.1.1640-ver；
 * - 修复版本：<version>-fix-<次数>-ver，例如 0.1.164-fix-210-ver。
 *
 * 用法：
 *   npm run release:tag                 # 正常发布
 *   npm run release:tag -- --fix 210    # 指定修复次数
 *   npm run release:tag -- --fix        # 自动取下一个修复次数
 *   npm run release:tag -- --dry-run    # 只预览，不创建/推送
 *   npm run release:tag -- --check      # 校验 HEAD 是否已有 -ver tag
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const VERSION_RE = /^\d+\.\d+\.\d+$/;
const TAG_SUFFIX = "-ver";

export function buildTagName(version, { fix } = {}) {
  if (typeof version !== "string" || !VERSION_RE.test(version)) {
    throw new Error(`版本号格式错误：${version}（应为 x.y.z）`);
  }

  if (fix === undefined || fix === null) {
    return `${version}${TAG_SUFFIX}`;
  }

  const fixNumber = Number(fix);
  if (!Number.isInteger(fixNumber) || fixNumber < 1) {
    throw new Error(`fix 次数必须是正整数：${fix}`);
  }

  return `${version}-fix-${fixNumber}${TAG_SUFFIX}`;
}

export function nextFixNumber(tags, version) {
  const prefix = `${version}-fix-`;
  let max = 0;

  for (const tag of tags) {
    if (!tag.startsWith(prefix) || !tag.endsWith(TAG_SUFFIX)) {
      continue;
    }
    const raw = tag.slice(prefix.length, tag.length - TAG_SUFFIX.length);
    if (/^\d+$/.test(raw)) {
      max = Math.max(max, Number(raw));
    }
  }

  return max + 1;
}

export function parseArgs(argv) {
  const options = {
    branch: "master",
    remote: "origin",
    fix: undefined,
    fixSpecified: false,
    dryRun: false,
    noPush: false,
    check: false,
    message: undefined,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg === "--fix") {
      options.fixSpecified = true;
      const next = argv[index + 1];
      if (next !== undefined && /^\d+$/.test(next)) {
        options.fix = Number(next);
        index += 1;
      }
      continue;
    }

    if (arg.startsWith("--fix=")) {
      options.fixSpecified = true;
      options.fix = Number(arg.slice("--fix=".length));
      continue;
    }

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg === "--no-push") {
      options.noPush = true;
      continue;
    }

    if (arg === "--check") {
      options.check = true;
      continue;
    }

    if (arg === "--branch") {
      options.branch = requireValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--branch=")) {
      options.branch = arg.slice("--branch=".length);
      continue;
    }

    if (arg === "--remote") {
      options.remote = requireValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--remote=")) {
      options.remote = arg.slice("--remote=".length);
      continue;
    }

    if (arg === "--message" || arg === "-m") {
      options.message = requireValue(argv, index, arg);
      index += 1;
      continue;
    }

    throw new Error(`未知参数：${arg}`);
  }

  return options;
}

function requireValue(argv, index, flag) {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${flag} 缺少参数值`);
  }
  return value;
}

function git(args, { allowFailure = false } = {}) {
  try {
    return execFileSync("git", args, {
      cwd: ROOT_DIR,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    }).trim();
  } catch (error) {
    if (allowFailure) {
      return null;
    }
    const stderr = error.stderr?.toString().trim();
    throw new Error(`git ${args.join(" ")} 失败${stderr ? `：${stderr}` : ""}`);
  }
}

function readPackageVersion() {
  const packageJson = JSON.parse(
    readFileSync(join(ROOT_DIR, "package.json"), "utf8"),
  );
  return packageJson.version;
}

function printHelp() {
  console.log(`发布 tag 工具（REQ-202610-1374）

用法：
  npm run release:tag                 正常发布：<version>-ver
  npm run release:tag -- --fix 210    修复发布：<version>-fix-210-ver
  npm run release:tag -- --fix        自动取下一个修复次数
  npm run release:tag -- --dry-run    只预览，不创建/推送
  npm run release:tag -- --check      校验 HEAD 是否已有 -ver tag

可选参数：
  --branch <name>   发布分支，默认 master
  --remote <name>   远端名称，默认 origin
  --no-push         只创建本地 tag，不推送
  --message, -m     自定义 tag 说明
  --help, -h        显示帮助`);
}

function listLocalTags() {
  return git(["tag", "--list"])
    .split("\n")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function listRemoteTags(remote) {
  const output = git(["ls-remote", "--tags", remote], { allowFailure: true });
  if (!output) {
    return [];
  }

  return output
    .split("\n")
    .map((line) => line.trim().split(/\s+/)[1])
    .filter(Boolean)
    .map((ref) => ref.replace(/^refs\/tags\//, "").replace(/\^\{\}$/, ""));
}

function tagExists(tag, remote, { checkRemote }) {
  if (git(["rev-parse", "-q", "--verify", `refs/tags/${tag}`], { allowFailure: true })) {
    return "local";
  }

  if (checkRemote) {
    const remoteTag = git(
      ["ls-remote", "--tags", remote, `refs/tags/${tag}`],
      { allowFailure: true },
    );
    if (remoteTag) {
      return "remote";
    }
  }

  return null;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);

  if (options.help) {
    printHelp();
    return 0;
  }

  const version = readPackageVersion();

  if (options.check) {
    const headTags = git(["tag", "--points-at", "HEAD"])
      .split("\n")
      .map((tag) => tag.trim())
      .filter(Boolean);
    const releaseTags = headTags.filter((tag) => tag.endsWith(TAG_SUFFIX));
    const shortHead = git(["rev-parse", "--short", "HEAD"]);

    if (releaseTags.length > 0) {
      console.log(`✅ HEAD ${shortHead} 已有发布 tag：${releaseTags.join(", ")}`);
      return 0;
    }

    console.error(`❌ HEAD ${shortHead} 没有 -ver 发布 tag`);
    return 1;
  }

  const knownTags = options.dryRun
    ? listLocalTags()
    : [...new Set([...listLocalTags(), ...listRemoteTags(options.remote)])];
  const fix =
    options.fixSpecified && options.fix === undefined
      ? nextFixNumber(knownTags, version)
      : options.fix;
  const tag = buildTagName(version, options.fixSpecified ? { fix } : {});

  const currentBranch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  if (currentBranch !== options.branch) {
    throw new Error(
      `当前分支是 ${currentBranch}，发布 tag 必须在 ${options.branch} 上执行（可用 --branch 覆盖）`,
    );
  }

  const dirty = git(["status", "--porcelain"]);
  if (dirty) {
    throw new Error("工作区有未提交改动，请先提交后再发布 tag");
  }

  const head = git(["rev-parse", "HEAD"]);

  if (options.dryRun) {
    const exists = tagExists(tag, options.remote, { checkRemote: false });
    if (exists) {
      throw new Error(`tag 已存在（${exists}）：${tag}`);
    }
    console.log(`[dry-run] version: ${version}`);
    console.log(`[dry-run] branch: ${currentBranch} (${head.slice(0, 7)})`);
    console.log(`[dry-run] tag: ${tag}`);
    console.log("[dry-run] 未创建、未推送 tag");
    return 0;
  }

  const exists = tagExists(tag, options.remote, { checkRemote: !options.noPush });
  if (exists) {
    throw new Error(`tag 已存在（${exists}）：${tag}`);
  }

  if (!options.noPush) {
    const remoteHead = git([
      "ls-remote",
      options.remote,
      `refs/heads/${options.branch}`,
    ])
      .split(/\s+/)[0];
    if (!remoteHead) {
      throw new Error(`远端 ${options.remote} 不存在分支 ${options.branch}`);
    }
    if (remoteHead !== head) {
      throw new Error(
        `HEAD ${head.slice(0, 7)} 与 ${options.remote}/${options.branch} ${remoteHead.slice(0, 7)} 不一致，请先推送发布提交`,
      );
    }
  }

  const message = options.message ?? `Release ${tag}`;
  git(["tag", "-a", tag, "-m", message]);

  if (options.noPush) {
    console.log(`✅ 已创建本地 tag：${tag}`);
    return 0;
  }

  git(["push", options.remote, `refs/tags/${tag}`]);
  console.log(`✅ 已创建并推送 tag：${tag}`);
  console.log(`   commit: ${head}`);
  return 0;
}

const isDirectRun =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main()
    .then((code) => {
      if (code !== 0) {
        process.exit(code);
      }
    })
    .catch((error) => {
      console.error(`❌ ${error.message}`);
      process.exit(1);
    });
}
