# 移动端验收与性能基线

本文件是 ui-48（REQ-202610-0748）的执行手册，扩展
[`docs/visual-acceptance-checklist.md`](./visual-acceptance-checklist.md) §7 的设备矩阵与性能阈值。
目标是把「全平台适配」从静态检查表变成**可重复执行、可留痕、可对比**的验收流程。

> 自动化脚本只能证明 Chromium 移动模拟器下的回归情况，**不能替代 iOS Safari / Android Chrome 真机结论**。
> 发布候选仍须按 §7.1 完成至少 1 台 iOS 真机 + 1 台 Android 真机 + 1 台桌面真机。

## 1. 适用范围

- 页面：首页 `/`、房间页 `/room/:roomCode`。
- 核心流程：加入房间、发送文本、上传并发送文件、打开 / 关闭房间抽屉。
- 性能专项：首屏 LCP / CLS / TTFB、交互响应、长任务、首屏 JS、消息列表滚动帧率。
- 基线归属：性能与冒烟结果写入 `docs/visual-baseline/performance/<version>/`，与 ui-46 截图基线同版本管理。

## 2. 设备矩阵

| 优先级 | 平台 | 设备 / 模拟器 | 视口 | 浏览器 | 执行方式 | 必测流程 |
| --- | --- | --- | --- | --- | --- | --- |
| P0 | iOS 手机 | iPhone SE (2nd/3rd) | 375×667 | Safari（iOS 17/18） | **真机** | 加入、发文本、发图片、发文件、下载、抽屉、主题切换、二维码 |
| P0 | iOS 手机 | iPhone 15 / 15 Pro | 393×852 | Safari（iOS 17/18） | **真机** | 同上 + 灵动岛 / 安全区 |
| P0 | Android 手机 | Pixel 6a | 412×915 | Chrome（Android 14） | **真机** | 同上 + 返回键关闭抽屉、软键盘、文件选择 |
| P0 | Android 手机 | 主流国产机型（4GB+ RAM） | 360×800 / 412×915 | Chrome / 系统浏览器 | **真机** | 同上 + 厂商文件选择器 |
| P0 | 桌面 | Windows 11 / macOS | 1440×900、1920×1080 | Chrome、Edge、Safari | **真机** | 三栏、折叠、菜单、弹层、键盘全流程 |
| P1 | iOS 平板 | iPad 10th / iPad Pro 11 | 820×1180 | Safari | 真机或 Simulator | 两栏 + 成员抽屉、横竖屏、分屏 |
| P1 | Android 平板 | Pixel Tablet | 1280×800 | Chrome | 模拟器可接受 | 两栏 / 三栏边界、抽屉、触控 |
| P1 | 低端 Android | 4GB RAM，CPU 4× 降速 | 390×844 | Chrome | 真机优先 | 首屏、长列表滚动、发送、上传进度、内存不崩 |
| P2 | 桌面 Linux | Chromium（CI 基线环境） | 390×844 | Chromium | 自动化 | 截图基线、控制台错误、横向溢出、性能回归 |

### 2.1 执行规则

- 每个发布候选至少完成 **1 台 iOS 真机 + 1 台 Android 真机 + 1 台桌面真机**。
- 平板可用模拟器，但触摸、安全区、横竖屏必须实测；不得只看截图。
- Chrome DevTools 设备模拟只用于开发自测与 PR 冒烟，不能替代真机结论。
- 真机记录必须包含：设备型号、OS 版本、浏览器版本、网络（Wi-Fi / 4G / 5G）、截图或录屏。
- 任一核心流程失败即 P0，修复后重跑受影响平台与自动化冒烟。

## 3. 核心流程验收

### 3.1 加入房间（P0）

1. 打开首页，输入房间号（大小写不敏感，去除首尾空格）。
2. 如房间有门禁码，输入 6 位数字；错误门禁码应给出明确提示且不跳转。
3. 点击「进入房间」，等待房间页加载。
4. 预期：URL 变为 `/room/<roomCode>`；消息历史、公告、成员栏可见；输入框可聚焦；无横向滚动。

自动化覆盖：`smoke:mobile` 的 `join-room` 流程。

### 3.2 发送文本（P0）

1. 在输入框输入多行文本，确认字数计数与最大长度限制。
2. 点击「发送」或按 Enter（取决于 Enter 发送开关）。
3. 预期：消息立即以 pending 状态出现，服务端确认后不重复、不闪烁；列表滚动到底部；发送失败有 toast 与重试入口。

自动化覆盖：`smoke:mobile` 的 `chat` 流程。

### 3.3 上传并发送文件（P0）

1. 点击「文件」，选择图片与非图片文件各一个。
2. 预期：附件 chip 显示文件名与大小；可移除；上传进度可见。
3. 点击「发送」，等待上传与消息落库。
4. 预期：直传失败时自动回退代理上传；消息气泡显示附件；图片可预览，其它文件可下载；失败时有 toast，不静默丢失。

自动化覆盖：`smoke:mobile` 的 `upload` 流程（mock 环境强制直传失败，验证代理回退）。

### 3.4 打开 / 关闭房间抽屉（P0）

1. 在手机视口点击「隐藏导航栏」，确认房间列表收起。
2. 点击「显示导航栏」，确认列表恢复且当前房间高亮。
3. 对成员栏重复一次；横屏 / 平板确认两栏与抽屉边界。
4. Android 真机额外验证返回键关闭抽屉；打开弹层时焦点不逃逸、Esc / 返回可关闭。

自动化覆盖：`smoke:mobile` 的 `drawer` 流程。

## 4. 移动端性能专项

### 4.1 测量环境

| 项目 | 固定值 |
| --- | --- |
| 构建 | `npm run build` 后的 production server |
| 浏览器 | Chromium / Chrome（版本写入 manifest） |
| 视口 | 390×844，DPR 3，`isMobile: true`，`hasTouch: true` |
| locale / timezone | `zh-CN` / `Asia/Shanghai` |
| 动效 | `prefers-reduced-motion: reduce` |
| 主题 | dark（`localStorage["tb:theme"] = "dark"`） |
| 数据 | 固定 mock fixture；房间页 200 条消息用于长列表滚动 |
| 等待 | `main` 可见 + 字体加载 + LCP 出现后 1000ms 稳定期 |
| 滚动 | 冻结房间页加载后的自动 `scrollIntoView`，由脚本从顶部执行 80 步滚动采样 |
| 采样 | 每个「档位 × 页面」运行 3 次，指标取中位数 |

### 4.2 档位

| 档位 | CPU | 网络 | 用途 |
| --- | --- | --- | --- |
| `mobile-standard` | 无节流 | 无节流 | 观察常规移动端首屏与滚动 |
| `mobile-low-end` | CPU 4× | Slow 4G（下行 1.6 Mbps / 上行 750 Kbps / RTT 150ms） | 低端 Android 与弱网下限 |

### 4.3 指标与阈值

| 指标 | 字段 | 阈值 | 说明 |
| --- | --- | --- | --- |
| LCP | `lcpMs` | ≤ 2500ms | 首屏最大内容绘制 |
| CLS | `cls` | ≤ 0.1 | 排除用户输入后的布局偏移 |
| TTFB | `ttfbMs` | ≤ 800ms | 本地 production server 为下限参考 |
| INP 代理 | `interactionMs` | ≤ 200ms | PerformanceEventTiming 最大事件时长；0 表示无 >16ms 事件 |
| 首屏长任务 | `maxLongTaskMs` | ≤ 200ms | 最长 longtask |
| 滚动 p95 帧间隔 | `scrollP95FrameMs` | ≤ 50ms | 房间消息列表所在滚动容器 80 步采样（手机端为页面级滚动） |
| 滚动丢帧率 | `scrollDroppedFrameRatio` | ≤ 10% | 帧间隔 > 33.3ms 视为丢帧 |
| 首屏 JS（gzip） | `jsEncodedBytes` | 较上一基线增长 ≤ 10% | 首次基线仅记录；`--previous` 启用对比 |

`fcpMs` 与 `longTaskCount` 仅记录，不设阈值。阈值与
[`docs/visual-acceptance-checklist.md`](./visual-acceptance-checklist.md) §7.2 对齐；滚动指标为 ui-48 新增。

### 4.4 执行命令

```bash
# 1) 生产构建并启动
npm run build
npm start -- -p 3000

# 2) 另开终端采集性能基线（2 档位 × 2 页面 × 3 次）
npm run perf:mobile -- --base-url http://127.0.0.1:3000 --version 0.1.69

# 3) 指定上一版 manifest，检查首屏 JS 增长
npm run perf:mobile -- --version 0.1.70 \
  --previous docs/visual-baseline/performance/0.1.69/manifest.json

# 4) 只打印矩阵，不启动浏览器
npm run perf:mobile -- --dry-run

# 5) 使用真实后端（默认 mock /api/**）
npm run perf:mobile -- --no-mock --base-url http://127.0.0.1:3000
```

Chromium 查找顺序：`--chromium-path` > `CHROMIUM_PATH` > 系统 Chrome / Chromium >
Playwright 已下载的 headless shell。脚本不下载浏览器。

### 4.5 输出与判读

```text
docs/visual-baseline/performance/<version>/
├── manifest.json       # 性能基线：环境、原始样本、中位数、预算判定
├── smoke.json          # 核心流程冒烟结果
└── smoke-failure-*.png # 仅失败时生成
```

- `manifest.json` 中每个条目包含 `runs` 次原始样本与 `metrics` 中位数。
- `budgets.checks` 逐项记录实际值、阈值、是否通过与原因；`summary.failed > 0` 时脚本退出码为 1。
- 首次基线没有上一版 JS 数据，`jsEncodedBytes` 只记录；后续版本必须传 `--previous`。
- 本地 TTFB 不含公网 RTT，不能当作线上 TTFB；上线后需在真实网络补测并在验收记录中注明。
- 性能回退 > 20% 或超阈值时，必须在验收记录中说明原因并由负责人签字。

### 4.6 冒烟命令

```bash
# 生产服务已启动
npm run smoke:mobile -- --base-url http://127.0.0.1:3000 --version 0.1.69

# 只打印四条流程
npm run smoke:mobile -- --dry-run
```

冒烟在独立浏览器上下文中依次执行 `join-room`、`chat`、`upload`、`drawer`；
任一流程失败会截图并写入 `smoke.json`，整体退出码为 1。

## 5. 真机验收记录模板

```markdown
## 移动端验收记录 — v<version> / <commit>

- 执行人：
- 日期：
- 构建：production / <baseUrl>
- 自动化：`npm run test:mobile`、`npm run smoke:mobile`、`npm run perf:mobile`

### 设备矩阵

| 平台 | 设备型号 | OS | 浏览器 | 网络 | 结果 | 证据 |
| --- | --- | --- | --- | --- | --- | --- |
| iOS 手机 | iPhone 15 | iOS 18.x | Safari 18.x | Wi-Fi | PASS / FAIL | 截图 / 录屏 |
| Android 手机 | Pixel 6a | Android 14 | Chrome 13x | 4G | PASS / FAIL | 截图 / 录屏 |
| 桌面 | <机型> | Windows 11 / macOS | Chrome / Edge / Safari | Wi-Fi | PASS / FAIL | 截图 |
| 平板 | iPad 10th | iPadOS 18.x | Safari | Wi-Fi | PASS / FAIL | 截图 |

### 核心流程

| 流程 | iOS | Android | 平板 | 桌面 | 备注 |
| --- | --- | --- | --- | --- | --- |
| 加入房间 |  |  |  |  |  |
| 发送文本 |  |  |  |  |  |
| 上传并发送文件 |  |  |  |  |  |
| 打开 / 关闭抽屉 |  |  |  |  |  |
| 主题切换 / 二维码 |  |  |  |  |  |

### 性能基线

| 档位 | 页面 | LCP | CLS | TTFB | INP | 最长任务 | 滚动 p95 | 丢帧率 | 首屏 JS | 结果 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| mobile-standard | `/` |  |  |  |  |  |  |  |  |  |
| mobile-standard | `/room/:code` |  |  |  |  |  |  |  |  |  |
| mobile-low-end | `/` |  |  |  |  |  |  |  |  |  |
| mobile-low-end | `/room/:code` |  |  |  |  |  |  |  |  |  |

证据：`docs/visual-baseline/performance/<version>/manifest.json`

### 缺陷

| 级别 | 平台 | 现象 | 复现步骤 | 处理 |
| --- | --- | --- | --- | --- |
| P0 / P1 / P2 |  |  |  |  |

结论：<通过 / 有条件通过 / 不通过>
```

## 6. 缺陷分级

| 级别 | 定义 | 移动端示例 | 处理 |
| --- | --- | --- | --- |
| P0 阻塞 | 核心流程不可用、内容不可读、布局严重破坏 | 无法加入 / 发送 / 上传；横向滚动；抽屉无法关闭；软键盘遮挡发送按钮；文字对比度 < 4.5:1；残留蓝色强调 | 修复后重跑受影响真机与全量自动化 |
| P1 严重 | 明显回归或有绕过方式 | 触控目标 < 44×44px；焦点环缺失；安全区遮挡；状态色对比不足；上传进度不可见 | 合并前修复 |
| P2 一般 | 细节不一致，不影响使用 | 间距偏差 4px；图标线宽不一致；截断位置不理想 | 明确排期 |

**通过标准**：P0 = 0、P1 = 0；`smoke:mobile` 四条流程全部 PASS；
`perf:mobile` 所有预算通过（首次 JS 仅记录）；P2 有明确排期。

## 7. 已知限制

- Chromium 移动模拟器不是 WebKit；iOS Safari 的 100dvh、安全区、文件选择、回弹滚动必须真机验证。
- CDP 的 CPU / 网络节流是近似值，不包含真机温控、内存压力与厂商调度差异。
- mock 数据固定，真实房间的消息类型与附件尺寸可能不同；性能异常时用 `--no-mock` 复测。
- 本地 production server 的 TTFB 不含公网链路；线上性能需在部署环境补测。
- 自动化冒烟覆盖四条 P0 主路径，不覆盖创建房间、审批、邀请、二维码、主题切换等完整矩阵。

## 8. 维护

- 新增页面或性能档位：修改 `scripts/mobile-acceptance-lib.mjs` 的 `PERF_PAGES` / `PERF_PROFILES`，
  同步更新 `scripts/mobile-acceptance.test.mjs` 与本文件。
- 新增核心流程：在 `SMOKE_FLOWS` 增加条目，并在 `scripts/mobile-smoke.mjs` 的 `FLOW_RUNNERS` 实现。
- 调整阈值：先更新 `PERF_BUDGETS` 与测试，再更新本文件与 checklist §7.2；不得只改脚本不留记录。
- 每次发布候选重新采集并保留上一版本目录，不覆盖历史基线。
