# 发布 Tag 规范（REQ-202610-1374）

## 强制规则

- **每次发布推送都必须发布对应 tag**：合并到 `master` 并触发 Vercel 部署时，代码推送与 tag 发布必须在同一轮收尾中完成；只推代码不推 tag 视为发布未完成。
- **本项目部署在 Vercel，所有 tag 一律以 `-ver` 结尾。**
- tag 必须指向实际发布、触发部署的那个提交（`master` 上的发布提交）。
- 禁止强推、移动或覆盖已发布的 tag。

## 命名格式

| 场景 | 格式 | 示例 |
| --- | --- | --- |
| 正常版本 | `<version>-ver` | `0.1.1640-ver` |
| 修复版本 | `<version>-fix-<次数>-ver` | `0.1.164-fix-210-ver` |

说明：

- `<version>` 取 `package.json` 的 `version`，发布前先运行 `node scripts/sync-version.js`，确保 `src/lib/constants.ts` 同步。
- `<次数>` 是同一版本的修复序号（正整数）。使用 `--fix` 不带数字时，脚本会扫描已有 tag，自动取同版本最大序号 + 1。
- 示例中的 `0.1.1640-ver`、`0.1.164-fix-210-ver` 来自需求原文，仅用于说明格式，不代表当前版本号。

## 操作流程

1. 完成版本号修改与同步：

   ```bash
   npm version <version> --no-git-tag-version
   node scripts/sync-version.js
   ```

2. 将需求分支合并到 `master` 并推送，等待 Vercel 部署触发。

3. 在 `master` 上发布 tag：

   ```bash
   # 正常版本
   npm run release:tag

   # 修复版本（显式次数）
   npm run release:tag -- --fix 210

   # 修复版本（自动取下一个次数）
   npm run release:tag -- --fix
   ```

4. 验证：

   ```bash
   git tag --points-at HEAD
   git ls-remote --tags origin
   npm run release:tag -- --check
   ```

## 工具参数

`scripts/release-tag.mjs`：

| 参数 | 说明 |
| --- | --- |
| `--fix [n]` | 修复发布；省略 `n` 时自动取下一个修复次数 |
| `--dry-run` | 只打印将创建的 tag，不创建、不推送 |
| `--check` | 校验 `HEAD` 是否已有 `-ver` tag |
| `--branch <name>` | 发布分支，默认 `master` |
| `--remote <name>` | 远端名称，默认 `origin` |
| `--no-push` | 只创建本地 tag，不推送 |
| `--message, -m` | 自定义 tag 说明 |
| `--help, -h` | 显示帮助 |

脚本会依次校验：版本号格式、当前分支、工作区是否干净、远端分支是否与 `HEAD` 一致、tag 是否重名。任一检查失败都会直接退出，不会创建或推送 tag。

## 为什么需要 tag

- **可追溯**：每次发布对应一个不可变 tag，能精确回滚到线上版本。
- **可审计**：tag 与 `package.json` 版本、Vercel 部署提交一一对应。
- **可自动化**：后续 CI / 发布脚本可基于 `-ver` tag 识别发布事件。

## 验收清单

- [ ] `package.json` 与 `src/lib/constants.ts` 版本一致。
- [ ] `master` 上的发布提交已推送。
- [ ] `git tag --points-at HEAD` 包含本次 `-ver` tag。
- [ ] `git ls-remote --tags origin` 能看到该 tag。
- [ ] tag 名称符合「正常 `<version>-ver` / 修复 `<version>-fix-<次数>-ver`」。
