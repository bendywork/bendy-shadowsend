# 附件卡片规范（聊天页）

> 适用版本：v0.1.69（REQ-202610-0482 / ui-19，阶段二）
> 目标：把「内联预览 + 下载按钮」的旧结构收敛为一张统一卡片——文件类型图标、类型/大小元信息、预览/下载动作、上传与失败态共用同一套骨架，并与 up-05 的上传进度/重试衔接。

## 1. 结构

```
┌──────────────────────────────┐
│ 媒体预览（仅 IMAGE / VIDEO）   │  ← 可选，失败时降级为图标 + 文案
├──────────────────────────────┤
│ [类型图标] 文件名              │
│            类型 · 大小         │
│            [上传进度 / 错误]    │
│                        [动作]  │
└──────────────────────────────┘
```

- 媒体预览区：`IMAGE` 用按钮包裹 `<img>`，点击交给图片查看器；`VIDEO` 用原生 `<video controls>`；`NONE` 不渲染媒体区，避免空黑块。
- 信息区：类型图标由 `getAttachmentKind()` 决定；文件名单行截断，完整名称放在 `title`；元信息固定为「类型 · 大小」。
- 动作区：失败态优先显示「重试」；就绪态按能力显示「预览」（仅图片）与「下载」。
- 实现：`src/components/chat/attachment-card.tsx`；纯展示逻辑在 `src/lib/attachment.ts`。

## 2. 状态

| 状态 | 触发 | 媒体区 | 信息区 | 动作区 |
| --- | --- | --- | --- | --- |
| `ready` | 已发送附件 / 服务端消息 | 正常预览 | 类型 · 大小 | 预览、下载 |
| `uploading` | 乐观消息上传中 | 本地预览可用 | 进度条 + `上传中 n%` | 无（避免重复提交） |
| `failed` | 发送/上传失败 | 隐藏，防止误判为已上传 | `role="alert"` 错误文案 | 重试 |

卡片内部还有两个局部状态：

- `previewFailed`：图片/视频加载失败后替换为「预览加载失败」占位，不留下空白媒体框。
- `downloading` / `downloadError`：下载请求期间按钮显示加载图标并 `aria-busy`；失败时在信息区显示行内错误，同时通过 `onError` 上报给页面 Toast。

## 3. 类型映射

`getAttachmentKind(mimeType, fileName)` 先看 MIME，再看扩展名，最后回落到 `other`：

| 类型 | 图标 | 文案 key |
| --- | --- | --- |
| image | `Image` | `attachment.type.image` |
| video | `Video` | `attachment.type.video` |
| audio | `Music` | `attachment.type.audio` |
| pdf / word / text | `FileText` | `attachment.type.pdf` / `.word` / `.text` |
| spreadsheet | `FileSpreadsheet` | `attachment.type.spreadsheet` |
| presentation | `Presentation` | `attachment.type.presentation` |
| archive | `FileArchive` | `attachment.type.archive` |
| code | `FileCode` | `attachment.type.code` |
| other | `File` | `attachment.type.other` |

MIME 优先于扩展名：例如 `image/svg+xml` 即使文件名以 `.pdf` 结尾也按图片处理。

## 4. 交互与衔接

- 已发送消息：房间页通过 `renderAttachmentCard` 注入 `onPreview`（图片查看器）与 `onDownload`（先取签名 URL，再 `window.open`）。
- 乐观消息：同一组件以 `status="uploading"` 渲染，`progress` 直接来自发送流程；失败后 `status="failed"`，`onRetry` 调用 `retryPendingMessage()`，用保留的 `File[]` 重新走完整发送/上传流程。
- 进度条只改 `transform: scaleX()`，不触发布局；动画只使用 `transform`/`opacity`，`prefers-reduced-motion` 下关闭旋转与过渡。
- 下载失败不静默：卡片内保留错误文案，页面同时收到 `onError` 并弹 Toast；同一次失败只产生一条 Toast。

## 5. 可访问性

- 卡片根节点为 `<article aria-label={fileName}>`，读屏可直接定位文件。
- 图片预览按钮的 `aria-label` 为「预览: 文件名」；图片 `alt` 为「图片预览：文件名」。
- 上传进度使用 `role="progressbar"`，提供 `aria-valuemin/aria-valuemax/aria-valuenow` 与「上传进度」标签。
- 失败文案使用 `role="alert"`；重试/下载均为原生 `<button>`，支持键盘与焦点态。
- 视频附带「当前浏览器不支持视频预览」的 fallback 文本。

## 6. 样式令牌

全部颜色、圆角、间距、阴影、动效来自 `--ds-*` 自定义属性（见 `src/app/globals.css` 的 `.attachment-card*` 段）：

- 表面：`--ds-surface-raised` / `--ds-surface-sunken`
- 文本：`--ds-ink` / `--ds-ink-soft`
- 边框：`--ds-line-subtle`
- 危险态：`--ds-danger` / `--ds-danger-soft` / `--ds-danger-border`
- 圆角与阴影：`--ds-radius-*` / `--ds-shadow-*`

禁止在组件内硬编码颜色或间距。

## 7. 验收清单

- [ ] 图片、视频、PDF、Word、表格、演示文稿、压缩包、代码、文本、未知文件均显示对应图标与类型文案。
- [ ] 文件名、类型、大小在浅色/深色主题下层次清晰，长文件名不撑破气泡。
- [ ] 图片可打开查看器；视频可内联播放；其它类型只提供下载。
- [ ] 上传中显示百分比与进度条，动作按钮不可用。
- [ ] 上传失败显示错误与重试，重试后重新进入上传态。
- [ ] 图片/视频加载失败显示占位文案，不出现空白媒体框。
- [ ] 下载失败在卡片内与 Toast 同时可见（各一次）。
- [ ] 键盘可完成预览、下载、重试；进度条与错误可被读屏识别。
