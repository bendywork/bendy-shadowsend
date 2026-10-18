# 移动端性能与冒烟基线

本目录保存 ui-48 的移动端性能基线（`manifest.json`）与核心流程冒烟记录（`smoke.json`），
与 [`docs/mobile-acceptance.md`](../../mobile-acceptance.md) 配套使用。

## 目录结构

```text
docs/visual-baseline/performance/
├── README.md
├── manifest.template.json       # 性能 manifest 空模板
└── <version>/                   # 例如 0.1.69
    ├── manifest.json            # 2 档位 × 2 页面 × 3 次，含原始样本与预算判定
    ├── smoke.json               # 四条 P0 流程冒烟结果
    └── smoke-failure-*.png      # 仅失败时生成，不提交含敏感信息的截图
```

- `<version>` 与 `package.json` / 截图基线版本一致。
- 每次发布候选重新采集，保留上一版本目录，不原地覆盖。
- 失败截图仅在本地排查使用；提交前确认不含真实用户数据。

## 采集

```bash
npm run build
npm start -- -p 3000

# 另开终端
npm run perf:mobile -- --base-url http://127.0.0.1:3000 --version 0.1.69
npm run smoke:mobile -- --base-url http://127.0.0.1:3000 --version 0.1.69
```

常用参数：

- `--profiles mobile-standard,mobile-low-end`：只跑指定档位。
- `--pages home,room`：只跑指定页面。
- `--runs 3`：每项运行次数（1–10）。
- `--previous <manifest>`：对比上一版首屏 JS，增长 >10% 判失败。
- `--chromium-path <path>` 或 `CHROMIUM_PATH`：指定浏览器。
- `--no-mock`：使用真实后端（默认拦截 `/api/**` 返回固定演示数据）。
- `--dry-run`：只打印矩阵 / 流程，不启动浏览器。

## manifest 字段

```json
{
  "schemaVersion": 1,
  "kind": "mobile-performance",
  "baselineVersion": "0.1.69",
  "capturedAt": "2026-10-18T00:00:00.000Z",
  "baseUrl": "http://127.0.0.1:3000",
  "commit": "<git sha>",
  "environment": {
    "browser": "Chromium 151.0.7922.34",
    "executablePath": "/path/to/chrome",
    "platform": "linux",
    "viewport": { "name": "mobile-390", "width": 390, "height": 844, "deviceScaleFactor": 3 },
    "locale": "zh-CN",
    "timezone": "Asia/Shanghai",
    "reducedMotion": "reduce",
    "mockApi": true,
    "profiles": ["mobile-standard", "mobile-low-end"],
    "node": "v22.x"
  },
  "budgets": {
    "lcpMs": 2500,
    "cls": 0.1,
    "ttfbMs": 800,
    "interactionMs": 200,
    "maxLongTaskMs": 200,
    "scrollP95FrameMs": 50,
    "scrollDroppedFrameRatio": 0.1,
    "jsGrowthRatio": 0.1
  },
  "summary": { "total": 4, "passed": 4, "failed": 0 },
  "entries": [
    {
      "id": "mobile-low-end--room",
      "profile": "mobile-low-end",
      "page": "room",
      "path": "/room/DEMO01",
      "runs": 3,
      "metrics": {
        "lcpMs": 1800,
        "fcpMs": 900,
        "ttfbMs": 120,
        "cls": 0.02,
        "interactionMs": 80,
        "maxLongTaskMs": 120,
        "longTaskCount": 1,
        "jsEncodedBytes": 240000,
        "scrollP95FrameMs": 24,
        "scrollDroppedFrameRatio": 0.02
      },
      "budgets": { "pass": true, "checks": [], "violations": [] },
      "pass": true
    }
  ]
}
```

每个 entry 的 `samples` 保存 `runs` 次原始样本（含 `scrollContainer`、`scrollHeight` 等现场字段），
`metrics` 是逐指标中位数。`manifest.template.json` 为空模板，校验时需显式允许空 `entries`。
完整指标口径、阈值与判读方式见 [`docs/mobile-acceptance.md`](../../mobile-acceptance.md) §4。

## 0.1.69 基线结论

2026-10-18 在 Chromium 151 headless / Linux 上采集，结果见本目录 `0.1.69/manifest.json`：

- `mobile-standard`：首页、房间页全部预算通过；LCP 176ms / 688ms，滚动 p95 16.7ms。
- `mobile-low-end`：首页 LCP 788ms 通过，但最长任务 481ms 超 200ms；房间页 LCP 4664ms、
  最长任务 929ms、滚动 p95 66.8ms、丢帧率 21.25%，均超阈值。
- 结论：低端机首屏与长列表滚动仍有关键性能债，需在后续优化批次处理；本基线作为对比起点保留，
  不作为「低端机已达标」的结论。优化方向：拆分房间页首屏 JS（二维码/弹层按需加载）、
  长列表渐进渲染或虚拟化、降低首屏 hydration 长任务。

上述数值随机器与浏览器版本波动；评审时以 `manifest.json` 的 `samples` 与环境字段为准。

## 评审与更新

1. 只接受在 production build 上采集的结果；dev server 数据不得入库。
2. PR 附 `manifest.json` 的 `summary`、四项指标变化与失败项解释。
3. 首屏 JS 增长 >10% 必须说明原因；新增依赖、组件拆分、字体变化都算变化来源。
4. 超阈值项不得直接改阈值放行；先定位回归，必要时由负责人签字并记录临时豁免。
5. 至少 1 名非作者复核环境字段（浏览器版本、视口、mock 开关、运行次数）。
