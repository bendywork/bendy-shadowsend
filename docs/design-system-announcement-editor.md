# 公告编辑器（抽屉式）设计说明

> 需求：REQ-202610-0486 / ui-23（路线图 §3.2 阶段二）
> 版本：v0.1.69

## 1. 目标

- 用右侧抽屉替代手写模态，编辑公告时保留房间上下文。
- 支持最多 3 张图片的添加、移除与原图预览，选择阶段即完成类型/大小/数量校验。
- 提供「编辑 ↔ 预览」双态，预览态复用真实公告卡片的排版。
- 保存成功走全局 Toast；保存失败同时给出抽屉内联错误与 Toast，抽屉不关闭、草稿不丢失。

## 2. 结构

```
AnnouncementEditor (components/chat)
└── Drawer (components/ui)
    ├── header: eyebrow / title / description / close
    ├── body: edit mode | preview mode
    └── footer: cancel / preview / save（preview mode: back / save）
```

- `Drawer` 是可复用右侧面板原语：portal 渲染到 `document.body`，`role="dialog"` + `aria-modal`，标题/描述通过 `aria-labelledby` / `aria-describedby` 关联。
- `AnnouncementEditor` 持有草稿状态（文本、图片、模式、局部错误），父页面只负责打开/关闭与保存请求。
- 纯逻辑集中在 `src/lib/announcement-editor.ts`，组件不直接拼请求体。

## 3. 交互契约

### 打开与关闭

- 打开：点击房间头部「编辑公告」，抽屉从右侧滑入；初始焦点落在文本域。
- 关闭：右上角关闭按钮、`Esc`、点击遮罩、底部「取消」。
- 保存中禁止关闭（关闭按钮禁用，Esc/遮罩/取消不生效），避免上传中断。
- 关闭后焦点归还触发按钮；页面滚动锁定，并补偿滚动条宽度。
- 移动端（≤640px）抽屉占满全宽，关闭按钮热区 44×44。

### 图片管理

- 入口为虚线「添加图片」磁贴；图片达到上限后入口隐藏。
- 选择规则：仅 `image/*`；单张 ≤200MB；总数 ≤3（`MAX_ANNOUNCEMENT_IMAGES`，可由环境变量下调/上调，上限 9）。
- 超限提示通过 Toast 汇总：类型不符、单张过大、超出数量分别提示。
- 已有图片保留 `existingIndex`，移除只影响当前草稿；新增图片使用 `URL.createObjectURL`，移除/关闭/卸载时统一 `revokeObjectURL`。
- 缩略图 hover 仅做 `transform: scale()`；触屏设备删除按钮常驻。

### 预览

- 「预览」先做空草稿校验，再切换到预览态；预览卡片展示与房间公告弹窗一致的结构（标题、正文、图片网格）。
- 预览图片可点击，交给页面已有的图片查看器（`z-50`，高于抽屉 `z-40`）。
- 预览态可直接保存，也可「返回编辑」。

### 保存

- 请求体：`{ text, keepImageIndexes, newImages }`。
  - `text` 统一 `trim()`；文本与图片不能同时为空。
  - `keepImageIndexes` 按当前顺序保留仍存在的已有图片原始下标。
  - 新图片先走既有上传流程，再提交 `s3Key/fileName/mimeType/sizeBytes/storage`。
- 成功后关闭抽屉、刷新房间快照并 Toast「公告已更新」。
- 失败时抽屉保持打开，错误信息同时出现在：
  - 抽屉底部 `role="alert"` 内联错误（持久，直到下次编辑/保存）；
  - 全局 Toast（统一 `toastError`，网络错误折叠为本地化文案）。
- 保存按钮显示 spinner + `aria-busy`，并禁用重复提交。

## 4. 可访问性

- 对话框语义：`role="dialog"`、`aria-modal="true"`、标题/描述关联。
- 焦点圈定：`Tab` / `Shift+Tab` 在面板内循环；无焦点元素时焦点落在面板。
- `Esc` 关闭（保存中除外）；遮罩使用 `mousedown`，避免拖选文本误关闭。
- 图片按钮均提供可读 `aria-label`（预览/删除 + 文件名）。
- 文本域 `maxLength` 与计数器一致，提示通过 `aria-describedby` 关联。
- `prefers-reduced-motion: reduce` 时关闭抽屉/遮罩动画。

## 5. 设计令牌与视觉

- 全部颜色、间距、圆角、阴影、动效使用 `--ds-*` 自定义属性，无硬编码。
- 抽屉：`--ds-surface-panel` 背景、`--ds-line-subtle` 分隔线、`--ds-shadow-lg` 浮层阴影。
- 编辑区：`--ds-ink-soft` 标签、`--ds-ink-muted` 辅助文字、`--ds-danger` 错误。
- 预览卡：`--ds-surface-card` + `--ds-shadow-sm`，与公告弹窗保持同一视觉语言。
- 动画只使用 `transform` / `opacity`，时长与缓动取自 `--ds-duration-*` / `--ds-ease-*`。

## 6. 文案

所有界面文案走 i18n（`src/lib/i18n/messages.ts`），zh/en 键位一一对应，编译期校验：

- `announcement.editor.*`：标题、说明、文本/图片标签、计数、添加/删除/预览、保存/取消、空态。
- `announcement.view.*`：公告查看弹窗标题与关闭按钮。
- `toast.noticeImageInvalid` / `toast.noticeImageTooLarge`：图片选择校验。

## 7. 验收清单

- [x] 抽屉从右侧打开，移动端全宽，`Esc`/遮罩/关闭按钮均可关闭。
- [x] 打开时焦点进入文本域，关闭后回到触发按钮；Tab 不逃出抽屉。
- [x] 文本 ≤1200 字，计数器实时更新；空白草稿不能预览/保存。
- [x] 最多 3 张图片；非图片、超大图片、超量选择均有 Toast 提示。
- [x] 已有图片可移除、可预览；新增图片可移除且 URL 被回收。
- [x] 预览态展示真实公告卡片，可返回编辑或直接保存。
- [x] 保存失败时抽屉不关闭，内联错误 + Toast 同时出现。
- [x] 保存成功关闭抽屉并刷新公告。
- [x] `npm test` / `npm run lint` / `npx tsc --noEmit` / `npm run build` 全绿。
