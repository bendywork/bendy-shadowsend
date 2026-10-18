# 复制反馈规范（REQ-202610-0494 / ui-31）

> 适用版本：v0.1.69
> 目标：所有复制入口共用同一套剪贴板回退、状态时长与文案；按场景选择「图标态」或「Toast」，不再各写各的。

## 1. 反馈路由

| 场景 | 控件形态 | 成功反馈 | 失败反馈 |
| --- | --- | --- | --- |
| 消息文本复制 | 常驻文案按钮（复制文本） | 图标切换为 Check，文案变「已复制」，1.6s 后复位 | 图标切换为 X，文案变「复制失败」，红色语义态 + 错误 Toast |
| 邀请链接复制 | 纯图标按钮（Header） | 图标切换为 Check + `success` Toast「加入链接已复制」 | 图标切换为 X + `error` Toast「复制失败，请检查浏览器权限」 |
| 后续新增复制入口 | 任一形态 | 复用 `CopyButton`，按上表选择是否叠加 Toast | 同上 |

判断口径：

- **按钮自身有常驻可见文案** → 图标态即可，不再叠加成功 Toast，避免同一结果播报两次。
- **纯图标按钮没有文案承载结果** → 图标态 + 成功 Toast，保证可见与可读。
- **失败**一律使用 `error` Toast（`role="alert"`），按钮同时保留红色失败态。

## 2. 实现结构

### 2.1 `src/lib/clipboard.ts`

- `copyTextToClipboard(text, deps?)`：优先 `navigator.clipboard.writeText`。
- 非安全上下文、权限被拒或旧浏览器自动回退到 `textarea + document.execCommand("copy")`。
- 空文本直接返回 `false`，不触碰剪贴板；所有异常收敛为布尔结果，调用方不写 `try/catch`。
- `deps` 仅用于单测注入，生产调用无需传参。

### 2.2 `src/lib/copy-feedback.ts`

- `COPY_FEEDBACK_DURATION_MS = 1600`：成功/失败态的共享停留时长。
- `CopyFeedbackState = "idle" | "copied" | "failed"`。
- `COPY_FEEDBACK_MESSAGE_KEYS` / `getCopyFeedbackMessageKey`：状态到 i18n 键的单一映射（`chat.copied` / `chat.copyFailed`）。

### 2.3 `src/components/ui/copy-button.tsx`

| Prop | 默认 | 说明 |
| --- | --- | --- |
| `value` | — | 写入剪贴板的文本；为空时点击不执行复制（保持可聚焦，避免 SSR 水合差异） |
| `label` | — | 空闲文案；`variant="icon"` 时同时作为 `aria-label` |
| `variant` | `"text"` | `text` 输出 `.copy-button`；`icon` 复用 `.icon-btn` |
| `toastOnSuccess` | `false` | 纯图标场景传 `true` |
| `toastOnError` | `true` | 失败默认走全局错误 Toast |
| `successToastMessage` | `toast.copied` | 邀请链接传 `toast.linkCopied` |
| `iconClassName` | — | 图标尺寸（消息按钮 12px、Header 16px） |

行为：

1. 点击后进入 `busy`，防止重复触发；`aria-busy` 同步。
2. 复制结果写入 `data-state`（`copied` / `failed`），按钮图标与文案随之切换。
3. 1.6s 后自动复位；重复点击会重置计时器，组件卸载时清理。
4. 图标按钮把结果文本放入 `sr-only` + `aria-live="polite"` 区域，视觉用户看图标与 Toast，读屏用户听到结果。

## 3. 视觉与动效

- 新增 `src/app/copy-feedback.css`，由 `layout.tsx` 引入。
- 成功使用 `--ds-success` / `--ds-success-soft` / `--ds-success-border`；失败使用 `--ds-danger*` 语义令牌。
- 图标切换使用 `copy-feedback-pop`，仅动 `opacity` / `transform`；`prefers-reduced-motion: reduce` 下关闭动画与过渡。
- 文案不再包含 emoji（`已复制✅` → `已复制`），状态由图标与语义色承载。

## 4. 可访问性

- 文案按钮保留原生 `<button>` 语义，可见文本即无障碍名称；结果变化通过 `aria-live="polite"` 播报。
- 图标按钮保持稳定的 `aria-label`（如「邀请」），复制结果由隐藏 live 区域播报，避免名称频繁变化导致读屏上下文丢失。
- 失败 Toast 为 `role="alert"` / `aria-live="assertive"`，与按钮红色态同时出现。
- `disabled` 与 `aria-busy` 在复制进行中生效，键盘无法重复提交。

## 5. 验收清单

- [ ] 点击消息「复制文本」：图标变 Check、文案变「已复制」，1.6s 后恢复；不出现重复成功 Toast。
- [ ] 点击 Header 邀请图标：图标变 Check，右上角出现「加入链接已复制」Toast，1.6s 后恢复。
- [ ] 剪贴板权限被拒：按钮变红色「复制失败」/ X，同时出现错误 Toast。
- [ ] 非安全上下文（HTTP / 旧浏览器）下复制仍通过 textarea 回退成功。
- [ ] 连续点击不会堆叠 Toast，也不会产生多个复位计时器。
- [ ] 深色 / 浅色主题下成功、失败语义色可读；减少动态效果偏好下无动画。
- [ ] 中文 / 英文文案均来自 i18n，无硬编码字符串与 emoji。
