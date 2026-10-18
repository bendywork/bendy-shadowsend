# Composer 设计规范（ui-21 / REQ-202610-0484）

房间输入区（composer）承接聊天主流程：文本输入、附件选择、上传状态和发送动作都在同一块 surface 内完成。本规范同时吸收 up-05 的上传进度、分片状态、失败重试与取消交互。

## 1. 结构

```text
composer
├─ composer__attachments（role=list）
│  └─ composer-chip × N
│     ├─ glyph（文件类型 / 完成 / 失败）
│     ├─ body（文件名、大小、状态、分片进度条）
│     └─ actions（失败重试、移除）
├─ composer-summary（上传中或失败时出现，role=status）
│  ├─ 汇总文案 + 全部重试
│  └─ 总进度条（role=progressbar）
└─ composer__surface
   ├─ textarea（sr-only label + aria-describedby）
   └─ composer__toolbar
      ├─ 文件 / 读取剪贴板 / 回车发送 switch
      └─ 字数计数器 + 发送按钮
```

- 组件文件：`src/components/chat/message-composer.tsx`
- 上传任务模型：`src/lib/upload-queue.ts`
- 样式：`src/app/globals.css` 的 `.composer*` / `.composer-chip*` 区块

## 2. 上传状态机

| 状态 | 触发 | UI |
| --- | --- | --- |
| `queued` | 选择文件后进入队列 | 「等待上传」，0% |
| `uploading` | 获得并发槽位 | spinner + 「上传中 N%」；分片时追加「分片 i/total」 |
| `done` | 上传接口返回 s3Key | 绿色勾选 + 「已上传」，100% |
| `failed` | 网络/接口失败（非主动取消） | 红色错误文案 + 单文件重试 |

规则：

1. 选择文件即预上传，最多同时 3 个任务（`MAX_CONCURRENT_UPLOADS`），其余排队。
2. 总进度按文件字节加权，避免大文件与小文件等权造成的视觉跳变。
3. 分片上传只在图片 ≥ 3MB 的链路出现；`chunkIndex` 从 0 开始，展示时 +1。
4. 移除上传中的文件会 `AbortController.abort()`；主动取消不弹错误 Toast、不进入 `failed`。
5. 失败任务保留 `File` 引用，重试时重置为 `queued` 并重新排队；「全部重试」批量重置。
6. 发送前要求所有附件为 `done`；发送时直接复用已上传结果，不重复上传。
7. 最多 20 个附件；超出时只保留可容纳数量并提示。

## 3. 视觉与 token

- 全部颜色、间距、圆角、阴影、时长来自 `--ds-*` 自定义属性，不硬编码。
- chip 背景随状态使用 `--ds-surface-elevated` / `--ds-action-soft` / `--ds-success-soft` / `--ds-danger-soft`，边框使用对应语义色。
- 进度条只用 `transform: scaleX()` 驱动，避免布局抖动；`prefers-reduced-motion` 下关闭过渡与 spinner 动画。
- 480px 以下：chip 独占一行，工具栏按钮最小高度 44px，发送按钮 40px，保证触控目标。
- 输入 surface 使用 `:focus-within` 提升边框和 ring，不依赖额外 wrapper。

## 4. 可访问性

- 每个附件 chip 位于 `role="list"` 容器，自身 `role="listitem"`。
- 单文件进度条与总进度条均带 `role="progressbar"`、`aria-valuemin/max/now` 和可读 `aria-label`。
- 上传汇总使用 `role="status"` + `aria-live="polite"`，失败时播报失败数量。
- 移除/重试按钮使用带文件名的 `aria-label`，不依赖图标含义。
- textarea 有 sr-only `label` 与提示文案 `aria-describedby`；回车发送为 `role="switch"` + `aria-checked`。
- 上传中表单 `aria-busy="true"`；发送按钮 `disabled` 时通过 `title` 说明等待或失败原因。

## 5. 验收清单

- [ ] 选择多个文件后立即出现 chip，最多 3 个并发上传。
- [ ] 每个 chip 显示文件名、大小、状态；分片上传显示 `i/total`。
- [ ] 总进度按字节加权，上传完成后汇总条消失。
- [ ] 上传失败显示错误与重试；「全部重试」可批量恢复。
- [ ] 移除上传中的文件会取消请求，不再出现该 chip。
- [ ] 附件未全部完成时发送按钮禁用，完成后可发送且不重复上传。
- [ ] 发送失败时 pending 气泡显示错误，发送中显示「发送中」。
- [ ] 键盘：Enter 发送、Shift+Enter 换行、Tab 可到达所有按钮、焦点环可见。
- [ ] 浅色/深色主题下对比度正常，480px 布局不溢出。
- [ ] `npm test` / `npm run lint` / `npx tsc --noEmit` / `npm run build` 全绿。
