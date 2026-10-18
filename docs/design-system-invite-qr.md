# 邀请 / 二维码弹窗规范（Invite Pass）

> 适用版本：v0.1.69（REQ-202610-0489 / ui-26）
> 目标：把「展示二维码、复制链接、说明有效期」收进同一个邀请动作，避免头部两个按钮各做一半。

## 1. 入口与动作

- 房间头部只保留一个 `QrCode` 图标按钮，`aria-label` / Tooltip 为「邀请与二维码」。
- 点击后打开邀请弹窗，并调用 `POST /api/rooms/:roomCode/invite` 生成 **15 分钟、一次性** 的邀请链接。
- 已有未过期链接时直接复用，不重复铸造；链接过期后再次打开会自动重新生成。
- 邀请链接可绕过门禁码与加入策略；被移出的成员仍需房主审批。弹窗底部必须保留这句说明。

## 2. 结构

```
┌ overlay ─────────────────────────────────────────────┐
│ ┌ modal ───────────────────────────────────────────┐ │
│ │ eyebrow / 房间码        title        close       │ │
│ │ subtitle                                         │ │
│ │ ┌ pass ────────────────────────────────────────┐ │ │
│ │ │ QR (white surface) │ status chip + countdown │ │ │
│ │ │                    │ expiry / facts / hint   │ │ │
│ │ └──────────────────────────────────────────────┘ │ │
│ │ link label                                       │ │
│ │ [ invite link input ................ ] [复制链接] │ │
│ │ copy feedback (live region)                      │ │
│ │ footnote                            [重新生成]    │ │
│ └──────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

- 二维码区域固定使用 `--ds-qr-surface` 白底与 `--ds-qr-dark` 码点，不随主题反色。
- 右侧信息栏用虚线分隔，依次为状态徽标 / 倒计时、失效时间、有效期与使用方式、审批提示。
- 链接输入框只读，聚焦时自动全选；复制按钮是唯一主操作。
- 移动端（≤640px）弹窗全屏、单列；二维码缩至 `min(220px, 72vw)`；复制按钮与重新生成按钮高度 ≥44px。

## 3. 状态机

| 状态 | 触发条件 | 二维码 | 状态徽标 | 复制按钮 |
| --- | --- | --- | --- | --- |
| `loading` | 正在请求邀请链接 | 加载占位 | 正在生成 | 禁用 |
| `error` | 请求失败 | 失败占位 | 生成失败 | 禁用 |
| `active` | 剩余 >60s | 正常 | 链接有效 | 可用 |
| `expiring` | 剩余 ≤60s | 正常 | 即将过期（warning） | 可用 |
| `expired` | 剩余 = 0 | 降饱和 + 「链接已过期」遮罩 | 链接已过期（danger） | 禁用 |

- 倒计时每秒刷新，格式 `mm:ss`，向上取整，避免最后一秒提前显示 `00:00`。
- 失效时间文案：今天 / 明天 / 绝对日期，中文为「今天 14:32 失效」，英文为「Expires Today 14:32」。
- 请求使用递增 `requestId`，旧请求晚到不会覆盖新链接。
- 复制成功后按钮切换为「已复制」并显示 `role="status"` 行内反馈，1.8s 后复原；同时发一条 success Toast。

## 4. 可访问性

- `role="dialog"` + `aria-modal="true"`，由标题与副标题分别作为 `aria-labelledby` / `aria-describedby`。
- 打开时锁定 `body` 滚动并补偿滚动条宽度；焦点优先落在复制按钮，链接未就绪时落在关闭按钮。
- `Tab` / `Shift+Tab` 在弹窗内循环；`Escape`、点击遮罩、关闭按钮均可关闭；关闭后焦点归还触发按钮。
- 二维码 `alt` 包含房间名；纯装饰图标 `aria-hidden="true"`。
- 加载与复制反馈使用 `role="status"`，生成失败使用 `role="alert"`。

## 5. 设计令牌与动效

- 颜色：`--ds-surface-*`、`--ds-line-*`、`--ds-ink-*`、`--ds-success/warning/danger-*`、`--ds-qr-*`；禁止硬编码色值。
- 圆角：`--ds-radius-lg/xl/2xl`；间距：`--ds-space-*` 4px 节奏；阴影：`--ds-shadow-sm/lg`。
- 动画只使用 `opacity` 与 `transform`（遮罩淡入、面板上浮 12px + 轻微缩放），`prefers-reduced-motion` 下关闭。
- 样式文件：`src/app/invite-modal.css`，由 `globals.css` 在 Tailwind 之后引入。

## 6. 验收清单

- [x] 头部「邀请」「二维码」合并为一个入口，不存在重复动作。
- [x] 弹窗内同时可见二维码、完整链接、复制按钮、有效期与使用限制。
- [x] 复制成功 / 失败均有 Toast，按钮有「已复制」态。
- [x] 链接过期后复制禁用，二维码降饱和并显示过期遮罩，可一键重新生成。
- [x] 请求失败显示行内错误 + Toast，重新生成按钮变为「重试」。
- [x] 键盘可完成打开 → 复制 → 关闭全流程，焦点不逃逸。
- [x] 390px 宽度无横向滚动，触控目标 ≥44px。
- [x] `npm test`（39 条）、`npm run lint`、`npx tsc --noEmit`、`npm run build` 全部通过。

## 7. 测试

- `src/lib/invite.test.ts`：剩余时间钳制、状态切换、`mm:ss` 格式、今天/明天/绝对日期。
- `src/components/chat/invite-modal.test.tsx`：加载、正常、即将过期、过期、失败、已复制六种渲染状态（`renderToStaticMarkup`，无需 jsdom）。
- `vitest.config.ts` 的 include 扩展为 `src/**/*.test.{ts,tsx}`。
