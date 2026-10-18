#!/usr/bin/env node
/**
 * UI 规范一致性检查（ui-07）
 *
 * 1. 业务代码禁止直接依赖 lucide-react，图标只能从 @/components/ui/icons 具名导入。
 * 2. 图标不得再用 h- / w- 工具类控制尺寸，必须走 size token。
 * 3. 排版 token / 语义类 / 等宽数字类必须存在于 globals.css。
 * 4. 版本号三处保持一致（package.json / package-lock.json / constants.ts）。
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = join(import.meta.dirname, "..");
const failures = [];

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const sourceFiles = walk(join(root, "src")).filter((file) =>
  /\.(tsx?|jsx?)$/.test(file),
);
const iconsModule = join(root, "src/components/ui/icons.tsx");

for (const file of sourceFiles) {
  const rel = relative(root, file);
  const content = readFileSync(file, "utf8");

  if (file !== iconsModule && /from\s+["']lucide-react["']/.test(content)) {
    failures.push(`${rel}: 直接导入 lucide-react，应改用 @/components/ui/icons`);
  }

  const iconTag = /<([A-Za-z]+Icon)\b([^>]*?)\/?>/g;
  for (const match of content.matchAll(iconTag)) {
    if (/\b[hw]-\d/.test(match[2])) {
      failures.push(`${rel}: <${match[1]}> 使用 h-*/w-* 控制尺寸，应改用 size token`);
    }
  }
}

const css = readFileSync(join(root, "src/app/globals.css"), "utf8");
for (const required of [
  "--type-display-size",
  "--type-title-size",
  "--type-heading-size",
  "--type-body-size",
  "--type-caption-size",
  ".type-display",
  ".type-title",
  ".type-heading",
  ".type-body",
  ".type-caption",
  ".type-numeric",
  "font-variant-numeric: tabular-nums",
]) {
  if (!css.includes(required)) failures.push(`globals.css: 缺少 ${required}`);
}

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
const constants = readFileSync(join(root, "src/lib/constants.ts"), "utf8");
const parts = constants.match(
  /APP_VERSION_PARTS\s*=\s*\{[\s\S]*?major:\s*(\d+)[\s\S]*?minor:\s*(\d+)[\s\S]*?patch:\s*(\d+)/,
);
const constantsVersion = parts ? `${parts[1]}.${parts[2]}.${parts[3]}` : "unknown";

if (pkg.version !== lock.version || pkg.version !== lock.packages?.[""]?.version) {
  failures.push(`版本不一致: package.json=${pkg.version}, package-lock=${lock.version}`);
}
if (pkg.version !== constantsVersion) {
  failures.push(`版本不一致: package.json=${pkg.version}, constants.ts=${constantsVersion}`);
}

if (failures.length > 0) {
  console.error("UI 规范检查失败：");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `UI 规范检查通过：${sourceFiles.length} 个源文件无直连 lucide；排版 token/类齐全；版本 ${pkg.version} 三处一致。`,
);
