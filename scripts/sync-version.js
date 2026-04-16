#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * 版本号同步脚本
 * 
 * 用法：
 * - 修改 package.json 的 version 后运行：node scripts/sync-version.js
 * - 自动同步版本号到 src/lib/constants.ts
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const packageJsonPath = path.join(rootDir, 'package.json');
const constantsPath = path.join(rootDir, 'src/lib/constants.ts');

// 读取 package.json
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const version = packageJson.version;

// 解析版本号
const [major, minor, patch] = version.split('.').map(Number);

if (isNaN(major) || isNaN(minor) || isNaN(patch)) {
  console.error('❌ 版本号格式错误，应为 semver 格式 (如 0.1.54)');
  process.exit(1);
}

// 读取 constants.ts
let constantsContent = fs.readFileSync(constantsPath, 'utf8');

// 替换版本号
constantsContent = constantsContent.replace(
  /export const APP_VERSION_PARTS = \{[\s\S]*?major: \d+,[\s\S]*?minor: \d+,[\s\S]*?patch: \d+,[\s\S]*?\} as const;/,
  `export const APP_VERSION_PARTS = {
  major: ${major},
  minor: ${minor},
  patch: ${patch},
} as const;`
);

// 写回 constants.ts
fs.writeFileSync(constantsPath, constantsContent);

console.log(`✅ 版本号已同步:`);
console.log(`   package.json: ${version}`);
console.log(`   constants.ts: APP_VERSION_PARTS = { major: ${major}, minor: ${minor}, patch: ${patch} }`);
