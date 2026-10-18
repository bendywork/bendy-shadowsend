# 提示体系规范（Tooltip / Popover / Toast）

> 适用版本：v0.1.66（REQ-202610-0469 / ui-06）
> 目标：三类提示各司其职，触发时机、停留时长与视觉样式统一；复制、成功、错误、网络异常不再各写各的。
> 全局反馈路由（动作结果 vs 字段行内校验）见 `docs/design-system-feedback.md`（v0.1.68 / ui-12）。

## 1. 选择哪一种提示

| 场景 | 组件 | 触发方式 | 是否打断操作 |
| --- | --- | --- | --- |
| 解释图标按钮、补充字段含义 | Tooltip | 悬停约 500ms / 键盘聚焦立即 | 否 |
| 承载表单、设置、详情等可交互内容 | Popover | 点击触发按钮 | 是（模态遮罩） |
| 操作结果、复制反馈、网络异常 | Toast | 动作完成后自动出现 | 否（右上角浮层，不抢焦点） |

判断口径：

- **只是说明，不需要点** → Tooltip。
- **需要在浮层里输入或选择** → Popover。
- **动作已经发生，只需告知结果** → Toast。
- 表单字段的即时校验错误留在字段下方行内展示，提交失败等跨字段结果用 Toast，二者不重复播报。

## 2. Tooltip

实现：`src/components/ui/tooltip.tsx`

- 悬停延时 `TOOLTIP_DELAY_MS = 500`；移出后保留 `TOOLTIP_HIDE_DELAY_MS = 120` 的宽限期，避免指针抖动导致闪烁。
- 键盘 `focus` 立即显示，`blur` 收起；`Escape` 可关闭。
- 子元素为合法 React 元素时自动注入 `aria-describedby`；气泡本体 `role="tooltip"`，关闭时 `aria-hidden="true"`。
- 样式：`.tooltip-bubble` / `.tooltip-bubble--top|--bottom` / `.tooltip-bubble--open`；最大宽度 `min(240px, 100vw - 32px)`，允许换行，长词断行。
- 仅用于短文本（建议 ≤ 24 个汉字），不放按钮或链接。

```tsx
<Tooltip label={t("header.invite")}>
  <IconButton aria-label={t("header.invite")} icon={Link2} />
</Tooltip>
```

## 3. Popover

实现：`src/components/ui/popover.tsx`

- 点击触发；`portal` 渲染到 `body`，避免被祖先 `overflow` 裁剪。
- 半透明遮罩 + 居中面板；点击遮罩、点击关闭按钮、按 `Escape` 关闭。
- 打开时锁定页面滚动并补偿滚动条宽度；焦点移入面板，`Tab` / `Shift+Tab` 在面板内循环；关闭后焦点归还触发元素。
- 语义：`role="dialog"`、`aria-modal="true"`，有标题时用 `aria-labelledby`，无标题时用 `aria-label`。
- 样式：`.popover-backdrop`、`.popover-panel`、`.popover-panel--in`；入场只动 `opacity` / `transform`。
- 复杂确认流程若需要独立页面级弹窗，沿用 ui-05 的 Modal 体系；Popover 面向轻量设置面板。

## 4. Toast

实现：`src/lib/toast-store.ts`（框架无关单例）+ `src/components/ui/toast.tsx`（`ToastProvider`）

### 4.1 时长

| 变体 | 用途 | 停留时长 |
| --- | --- | --- |
| `success` | 复制成功、保存成功、操作完成 | 2400ms |
| `info` | 中性说明、申请已提交 | 3000ms |
| `warning` | 接近上限、输入被裁剪 | 3600ms |
| `error` | 请求失败、网络异常 | 4800ms |

- 时长由 store 的 `TOAST_DURATIONS` 统一定义，调用方不要逐个传 `duration`；确需覆盖时显式传入。
- 悬停暂停倒计时，移出后按原剩余时长继续。
- 最多同时显示 3 条，超出时移除最旧一条。
- 相同 `variant + message` 的提示会复用同一条并重置计时（`revision` 递增），轮询或重复点击不会堆叠。
- 空消息直接忽略，不产生空 Toast。

### 4.2 用法

```ts
import { toast } from "@/lib/toast-store";

toast.success(t("toast.linkCopied"));
toast.error(t("toast.copyFailed"));
toast.warning(t("toast.roomLimit", { max: MAX_USER_ROOMS }));
toast.info(t("toast.joinRequestSent"));
```

- 文案一律走 i18n（`toast.*`），不在调用点硬编码中文。
- 后端返回的可读错误优先展示后端 `message`；网络层异常使用 `toast.networkError`。
- 同一动作只发一条 Toast；不要同时保留旧的 `hint` 提示条或 `alert`。
- 可访问性：`error` / `warning` 使用 `role="alert"` + `aria-live="assertive"`；`success` / `info` 使用 `role="status"` + `aria-live="polite"`；`aria-atomic="true"`。
- 关闭按钮具备 `aria-label`，键盘可操作。

### 4.3 视觉

- 顶部居中浮层（`.toast-viewport`），最大宽度 420px，`z-index: 100`，`pointer-events: none`，卡片自身恢复点击。
- 卡片使用 `.toast-card` 与语义令牌：surface 面板、轻投影、模糊背景；左侧 2px 状态色内嵌竖条区分变体。
- 图标与状态色：success = 语义 success；warning = 语义 warning；error = 语义 danger；info = ink。
- 动画 `toast-in` 仅改变 `opacity` / `transform`。

## 5. 动效与无障碍

- 所有提示动画只使用 `transform` / `opacity` / `clip-path` / `filter`，不触发布局。
- `prefers-reduced-motion: reduce` 下关闭 Toast / Popover 入场动画与 Tooltip 过渡。
- Tooltip 与 Popover 均支持 `Escape` 关闭；Popover 完成焦点圈定与归还。
- 颜色全部来自设计令牌（`--ds-*`），不新增硬编码色值。

## 6. 验收清单

- [ ] 图标按钮悬停 500ms 出现 Tooltip，移出 120ms 内消失，键盘聚焦立即可见。
- [ ] Popover 打开后滚动锁定、焦点进入面板、Tab 不逃逸、Esc / 遮罩可关闭、关闭后焦点回到触发按钮。
- [ ] 复制链接成功出现 `success` Toast；失败出现 `error` Toast；无 `alert`。
- [ ] 同一错误连续触发只保留一条 Toast 并重置计时。
- [ ] 深色 / 浅色主题下三类提示均使用语义色，对比度可读。
- [ ] 减少动态效果偏好下无入场动画。
