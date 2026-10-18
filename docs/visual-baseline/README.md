# 视觉截图基线

本目录保存「双主题 × 三断点」视觉回归的截图基线，配合
[`docs/visual-acceptance-checklist.md`](../visual-acceptance-checklist.md) 使用。

基线回答两个问题：

1. 这次改动前后，页面在 dark / light 与 mobile / tablet / desktop 下到底哪里变了？
2. 变化是预期内的 UI 改版，还是误伤？

## 目录结构

```text
docs/visual-baseline/
├── README.md
├── manifest.template.json       # manifest 字段说明（空模板）
└── <version>/                   # 例如 0.1.69
    ├── home--dark--390x844.png
    ├── home--light--390x844.png
    ├── room--dark--834x1194.png
    ├── not-found--light--1440x900.png
    └── manifest.json            # 该版本基线的索引与哈希
```

- `<version>` 取 `package.json` 的 semver，与发布版本一致。
- 当前已提交 `0.1.69` 基础集（18 张，采集于提交 `5f486dd`，Chromium 151 headless，
  固定 mock 数据）；后续 UI 批次合并后按「评审与更新」重新采集，不覆盖本目录。
- 基础集固定为 **3 页面 × 2 主题 × 3 视口 = 18 张**：
  - 页面：`home`（`/`）、`room`（`/room/DEMO01`）、`not-found`（不存在路由）。
  - 视口：`390×844`（mobile）、`834×1194`（tablet）、`1440×900`（desktop）。
- 发布候选可扩展到 9 个视口（54 张），扩展集不替代基础集。

## 命名规则

`<page>--<theme>--<width>x<height>.png`

- `page`：`home` / `room` / `not-found`，小写、连字符分隔。
- `theme`：`dark` / `light`。
- 尺寸：整数宽高，单位 px。
- 文件名不得包含空格、斜杠、中文或 `..`；脚本会拒绝非法 page key。

## 采集环境

| 项目 | 固定值 |
| --- | --- |
| 浏览器 | Chromium / Chrome（版本写入 manifest） |
| deviceScaleFactor | `1` |
| locale | `zh-CN` |
| timezone | `Asia/Shanghai` |
| 动效 | `prefers-reduced-motion: reduce` |
| 主题 | `localStorage["tb:theme"]` 预设，截图前校验 `data-theme` |
| 数据 | 固定 mock fixture，不使用真实用户数据 |
| 等待 | `main` 可见 + 字体加载 + 700ms 稳定期 |
| 截图范围 | 默认视口；整页需显式 `--full-page`，同一版本内保持一致 |

## 采集命令

```bash
# 0) 首次使用：安装轻量驱动（不下载浏览器）
npm install -D playwright-core

# 1) 生产构建并启动
npm run build
npm start -- -p 3000

# 2) 另开终端采集基础集（默认 18 张，写入 docs/visual-baseline/<version>/）
npm run visual:baseline -- --base-url http://127.0.0.1:3000 --version 0.1.69

# 3) 指定 Chromium（本机没有 /usr/bin/chromium 时）
CHROMIUM_PATH=/path/to/chrome npm run visual:baseline -- --version 0.1.69

# 4) 扩展 9 视口
npm run visual:baseline -- --version 0.1.69 \
  --viewports mobile-360,mobile-390,mobile-430,tablet-768,tablet-834,tablet-1024,desktop-1280,desktop-1440,desktop-1920

# 5) 只检查矩阵，不启动浏览器
npm run visual:baseline -- --dry-run
```

脚本默认拦截 `**/api/**` 返回固定演示数据（`--no-mock` 可关闭）。演示数据包含：

- 首页：1 个自建房间、在线人数。
- 房间页：2 名成员、1 条待审批请求、文本 / 文件 / 图片混合消息、公告。
- 广告位故意携带旧强调色 `#0a84ff` / `#0071e3`，用于验证前端不会把服务端 color 字段渲染成彩色。

> mock 只覆盖 API 数据，不改变路由与组件。若页面新增了必需接口，需同步扩展
> `scripts/visual-baseline.mjs` 的 fixture，否则截图会出现空态。

## manifest 字段

每次采集写出 `<version>/manifest.json`：

```json
{
  "schemaVersion": 1,
  "baselineVersion": "0.1.69",
  "capturedAt": "2026-10-18T00:00:00.000Z",
  "baseUrl": "http://127.0.0.1:3000",
  "commit": "<git sha>",
  "environment": {
    "browser": "Chromium 151.0.7922.34",
    "executablePath": "/path/to/chrome",
    "platform": "linux",
    "locale": "zh-CN",
    "timezone": "Asia/Shanghai",
    "deviceScaleFactor": 1,
    "reducedMotion": "reduce",
    "mockApi": true,
    "fullPage": false,
    "node": "v22.x"
  },
  "entries": [
    {
      "id": "home--dark--mobile-390",
      "page": "home",
      "path": "/",
      "theme": "dark",
      "viewport": { "name": "mobile-390", "width": 390, "height": 844, "breakpoint": "mobile" },
      "file": "home--dark--390x844.png",
      "sha256": "<64 位小写 hex>",
      "bytes": 123456
    }
  ]
}
```

`manifest.template.json` 是空模板；`validateManifest` 对空 entries 需要显式
`allowEmpty`，采集脚本自身会做完整校验。

## 评审与更新

1. **只在有意变更时更新**：UI 改版、令牌调整、文案布局变化才允许刷新基线；纯重构且视觉不变时不得覆盖。
2. **先看 diff 再提交**：用 `npx pixelmatch`、ImageMagick `compare` 等对比新旧图，每张变化图说明原因。
3. **保留旧版本**：至少保留上一个发布版本的目录，不在原目录原地覆盖。
4. **PR 必带**：`manifest.json` diff、变化截图、变化原因、受影响页面清单。
5. **评审人**：至少 1 名非作者确认「变化符合预期、无彩色强调残留、无布局回归」。
6. **不提交**：真实用户数据、含敏感信息的房间、带个人令牌的 URL、超过 5MB 的单张图片。

## 与并行 UI 分支的关系

基线以 master 的发布候选为准。并行 UI 分支（响应式抽屉、设置面板、状态页、组件拆分等）合并后，
页面结构会发生**预期内**变化，此时必须：

1. 在合并后的 master 重新构建并采集同一版本基线；
2. 逐张评审 diff，确认变化只来自已合并的 UI 需求；
3. 更新 `manifest.json` 并在 PR 中附变化说明。

未合并的页面/状态在清单中标记 `N/A`，不得用旧截图冒充新基线。
