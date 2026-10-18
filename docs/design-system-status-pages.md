# 全页状态页规范（404 / 错误 / 等待审批）

> 适用版本：v0.1.69（REQ-202610-0506 / ui-43）
> 目标：404、路由错误边界、房间加载失败与等待审批共用一套全页状态语言，替换旧的居中提示卡片；信息层级、操作出口、动效与可访问性保持一致。

## 1. 入口与变体

| 场景 | 入口 | code | tone | 主操作 | 次操作 |
| --- | --- | --- | --- | --- | --- |
| 路由不存在 | `src/app/not-found.tsx` | `404` | `neutral` | 返回首页 | 返回上一页 |
| 路由渲染异常 | `src/app/error.tsx` | `500` | `danger` | 重试（`reset`） | 返回首页 |
| 房间不存在 / 已销毁 | 房间页加载失败（`ROOM_NOT_FOUND` 或 HTTP 404） | `404` | `neutral` | 返回首页 | 重试 |
| 房间加载失败 | 房间页加载失败（其他错误） | `500` | `danger` | 重试 | 返回首页 |
| 等待审批 | 房间快照 `waitingApproval=true` | `WAIT` | `warning` | 立即检查 | 返回首页 |

- 房间失败类型由 `src/lib/status-page.ts` 的 `classifyRoomLoadFailure` 统一判定：`ApiRequestError.status === 404` 或 `code === "ROOM_NOT_FOUND"` 归为 `not-found`，其余（含网络异常、5xx、未知值）归为 `error`。
- 等待审批页每 `WAITING_APPROVAL_POLL_MS`（5000ms）自动刷新快照；「立即检查」按钮手动触发同一刷新，检查期间按钮禁用并显示加载图标。审批通过后快照自然切换到房间内容，无需刷新页面。

## 2. 结构（Anatomy）

实现：`src/components/system/status-page.tsx` + `src/app/status-page.css`

```text
main#main-content[data-tone]
├─ .status-page__texture            72px 细网格，径向渐隐
├─ .status-page__ghost              aria-hidden 的超大描边状态码
└─ .status-page__inner
   ├─ header.status-page__header    品牌（返回首页）+ 主题/语言切换
   └─ section.status-page__panel    aria-labelledby="status-page-title"
      ├─ .status-page__meta         状态码胶囊 · 分隔线 · eyebrow
      ├─ .status-page__signal       语义图标（danger/warning 着色）
      ├─ h1#status-page-title       标题（≤ 20ch，balance）
      ├─ p.status-page__description 说明（≤ 56ch，pretty）
      ├─ .status-page__body         可选插槽（如审批进度）
      ├─ .status-page__details      可选等宽详情（如 error digest）
      ├─ .status-page__actions      主/次/幽灵操作
      └─ .status-page__footnote     可选等宽脚注
```

- 页面刻意不采用「通用居中卡片」：由细网格背景、超大幽灵状态码与单侧小圆角面板构成编辑式构图。
- 面板使用非对称圆角（`--ds-radius-2xl` × 3 + `--ds-radius-xs` 左下），右上角有一个 10px 的角标；顶部左侧有一段 72px 的短横线作为视觉锚点。
- 状态码同时出现在背景幽灵字、面板 meta 胶囊两处，形成尺度对比；`aria-hidden` 保证读屏只读一次有效信息。

## 3. 操作（Actions）

`StatusAction` 字段：`key`、`label`、`href?`、`onClick?`、`variant?`、`icon?`、`disabled?`。

| variant | 用途 | 视觉 |
| --- | --- | --- |
| `primary` | 唯一推荐动作（重试 / 返回首页 / 立即检查） | `--ds-action-bg` 实底 |
| `secondary` | 并列出口（返回上一页 / 返回首页） | 描边 + `--ds-surface-elevated` |
| `ghost` | 低权重辅助动作 | 纯文字，hover 出现 `--ds-action-soft` |

- 有 `href` 时渲染 `next/link`，否则渲染 `type="button"`；`disabled` 仅对按钮生效。
- 所有操作最小高度 44px，移动端纵向铺满；`active` 仅位移 0.5px，不做宽度/高度动画。
- 主操作只保留一个；等待审批页的「立即检查」在主位，检查中通过 `disabled` + `Loader2` 旋转表达状态。

## 4. 设计令牌

全部颜色、间距、圆角、阴影、时长来自 `globals.css` 的 `--ds-*`，`status-page.css` 不出现硬编码色值（`color-mix` 仅对令牌做透明度混合）。

| 用途 | 令牌 |
| --- | --- |
| 画布 / 面板 | `--ds-surface-canvas`、`--ds-surface-panel`、`--ds-surface-card`、`--ds-surface-elevated` |
| 线条 | `--ds-line-subtle`、`--ds-line`、`--ds-line-strong` |
| 文字 | `--ds-ink`、`--ds-ink-soft`、`--ds-ink-muted`、`--ds-ink-faint` |
| 操作 | `--ds-action-bg`、`--ds-action-bg-hover`、`--ds-action-fg`、`--ds-action-soft` |
| 状态 | `--ds-danger*`、`--ds-warning*`、`--ds-success*` |
| 形状 | `--ds-radius-xs/md/lg/xl/2xl/full` |
| 间距 | `--ds-space-2` ~ `--ds-space-8` |
| 阴影 | `--ds-shadow-xs/lg` |
| 动效 | `--ds-duration-fast/base/slow/slower`、`--ds-ease-out/standard` |

- `data-tone="neutral"`：图标使用中性 action 色。
- `data-tone="danger"`：图标使用 danger 边框/底色/前景。
- `data-tone="warning"`：图标使用 warning 边框/底色/前景。
- 深浅色主题由令牌自动切换，无需在状态页写主题分支。

## 5. 动效

- 入场：面板 `status-panel-in`（opacity + translateY + scale），幽灵码 `status-ghost-in`，内容按 60/110/150/190/230/270/310ms 阶梯上浮，形成一次有节奏的页面加载。
- 等待态：当前步骤圆点与「自动检查」前缀点使用 `status-pulse`（opacity + scale）。
- 仅动画 `transform` / `opacity`，不触发布局；`prefers-reduced-motion: reduce` 下全部 `animation: none`。

## 6. 响应式

- `> 640px`：面板宽 `min(720px, 100%)`，垂直居中；操作横排。
- `≤ 640px`：内边距降为 `--ds-space-4`，品牌文字隐藏只留图标；面板内边距 `--ds-space-6`；标题改用 `clamp(1.8rem, 9vw, 2.6rem)`；操作纵向铺满；进度条由三列改为纵向列表并隐藏连接线；幽灵码缩小到 `clamp(9rem, 52vw, 17rem)`。
- 页面最小高度 `100dvh`，超长内容自然滚动；`overflow: hidden` 只裁切装饰层。

## 7. 可访问性

- 页面唯一主地标：`<main id="main-content" tabIndex={-1}>`，路由切换后可直接聚焦。
- 面板通过 `aria-labelledby="status-page-title"` 关联 `h1`；`h1` 全页唯一。
- 装饰元素（网格、幽灵码、图标、分隔线、步骤连接线、步骤圆点）全部 `aria-hidden="true"`。
- 状态码在 meta 中以文本呈现，读屏可获知 404 / 500 / WAIT。
- 操作均为原生 `<a>` / `<button>`；禁用态使用原生 `disabled`，焦点样式沿用全局 `:focus-visible`。
- 进度条使用 `<ol aria-label>`，每一步的完成/当前/待进入状态通过 `data-state` 表达，视觉与语义一致。
- 自动检查提示使用 `role="status"`，不打断读屏。

## 8. i18n

- 所有文案走 `status.*` 键，中英文表在 `src/lib/i18n/messages.ts` 中编译期校验键集合一致。
- 键组：`status.brand`、`status.backHome`、`status.back`、`status.retry`、`status.notFound.*`、`status.error.*`、`status.roomMissing.*`、`status.loadError.*`、`status.waiting.*`。
- `status.error.digest` 使用 `{ digest }` 插值；不得在组件内拼接中英文句子。
- 服务端错误详情只展示 `error.digest`，不展示堆栈、URL 或内部错误消息。

## 9. 测试

- `src/components/system/status-page.test.tsx`：SSR 渲染地标/标题关联、tone、图标、链接与按钮操作、details/footnote、步骤状态。
- `src/lib/status-page.test.ts`：404/`ROOM_NOT_FOUND` 与网络/5xx/未知值的分类，轮询常量。
- `vitest.config.ts` 的 `include` 已扩展为 `src/**/*.test.{ts,tsx}`。
- 组件测试通过 `react-dom/server` 做静态渲染，`next/image` 在测试中替换为原生 `img`，不引入浏览器环境。

## 10. 验收清单

- [ ] 访问不存在的路径显示 404 状态页，浏览器返回键与「返回上一页」行为一致（无历史时回首页）。
- [ ] 路由渲染抛错时显示 500 状态页，点击「重试」触发 `reset`；有 digest 时以等宽小字展示。
- [ ] 访问不存在/已销毁的房间显示 404 房间状态页，而不是通用错误。
- [ ] 房间接口 5xx 或断网时显示 500 状态页，「重试」可恢复。
- [ ] 等待审批页每 5 秒自动刷新；点击「立即检查」期间按钮禁用，失败时出现一条 Toast。
- [ ] 审批通过后无需手动刷新即可进入房间。
- [ ] 浅色/深色、中文/英文下排版不溢出，状态色对比可读。
- [ ] 键盘 Tab 可依次到达品牌、主题切换、语言切换与所有操作；焦点环可见。
- [ ] 开启「减少动态效果」后无入场/脉冲动画。
- [ ] `npm test`、`npm run lint`、`npx tsc --noEmit`、`npm run build` 全部通过。
