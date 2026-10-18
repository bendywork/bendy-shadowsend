# 图片查看器规范（聊天页 / 公告）

> 适用版本：v0.1.70（REQ-202610-0483 / ui-20，阶段二）
> 目标：把手写「双击放大」模态升级为完整的全屏图片查看器——缩放、多图切换、键盘操作、下载与关闭，视觉与现有弹层/媒体体系保持一致。

## 1. 结构

```
┌──────────────────────────────────────────────┐
│ 文件名                    [−] [+] [重置] [下载] [×] │  ← topbar
│ 当前 / 总数 · 缩放百分比                         │
├──────────────────────────────────────────────┤
│                                              │
│              ‹      图片舞台       ›           │  ← stage（缩放/拖拽）
│                                              │
├──────────────────────────────────────────────┤
│              [缩略图] [缩略图] [缩略图]          │  ← 仅多图
│        ← → 切换 · + − 缩放 · 0 重置 · Esc 关闭    │  ← footer hint
└──────────────────────────────────────────────┘
```

- 实现：`src/components/chat/image-viewer.tsx`；纯逻辑在 `src/lib/image-viewer.ts`；样式在 `src/app/image-viewer.css`（由 `globals.css` 引入）。
- 通过 `createPortal` 挂到 `document.body`，避免被聊天滚动容器或 `overflow` 裁剪。
- 组件受控：`items`、`index`、`onIndexChange`、`onClose` 由页面持有；查看器只负责交互与展示。
- `ImageViewerItem`：`{ id, src, fileName, onDownload? }`。有 `onDownload` 时调用页面下载流程（签名 URL）；没有时回退到 `<a download>`。

## 2. 交互

| 操作 | 触发方式 | 行为 |
| --- | --- | --- |
| 关闭 | Esc、右上角 ×、点击图片外空白 | 关闭并还原打开前焦点 |
| 上一张 / 下一张 | ← / →、左右按钮、缩略图 | 循环切换，缩放与平移重置 |
| 首张 / 末张 | Home / End | 跳到首/末张 |
| 放大 / 缩小 | `+` / `=`、`-` / `_`、工具栏、滚轮 | 1×–4×，步进 0.25× |
| 重置缩放 | `0`、重置按钮 | 回到 1×（适应舞台） |
| 快速缩放 | 双击图片 | 1× ↔ 2× |
| 平移 | 缩放后拖拽 | 按舞台尺寸计算边界并夹取 |
| 下载 | 下载按钮 | 调 `onDownload`；无处理器时 anchor 回退 |

- 切换图片后统一重置 `zoom = 1`、`offset = 0`、加载/失败状态与下载错误。
- 滚轮监听使用 `{ passive: false }` 并 `preventDefault()`，避免页面跟随滚动。
- 下载中按钮显示 spinner 且禁用；失败时查看器内 `role="alert"` + 页面 `onError` Toast 双通道。
- 图片加载失败显示「图片加载失败」与「重试」，重试通过递增 `key` 重新请求。
- 动画只使用 `opacity` / `transform`；`prefers-reduced-motion` 下关闭入场、spinner 与过渡。

## 3. 多图来源

| 场景 | 打开方式 | 图片集合 |
| --- | --- | --- |
| 已发送消息附件 | 点击附件卡片图片 | 同一条消息内所有 `previewType === "IMAGE"` 且有 `previewUrl` 的附件；下载走签名接口 |
| 乐观消息附件 | 点击附件卡片图片 | 同一条待发送消息内的图片；本地 blob 预览，不提供下载 |
| 公告编辑器 | 点击已选图片 | 当前编辑器内全部图片（含新选 blob） |
| 公告阅读弹窗 | 点击公告图片 | 当前公告全部图片 |

页面侧通过 `openAttachmentViewer()` / `openNoticeImageViewer()` / `openNoticeEditorImageViewer()` 组装 `ImageViewerItem[]`，并定位到被点击的图片；目标图片不存在时不做任何事。

## 4. 可访问性

- 根节点 `role="dialog"` + `aria-modal="true"` + `aria-label="图片查看器"`。
- 打开后焦点移到关闭按钮；关闭时还原到打开前的元素。
- Tab / Shift+Tab 在查看器内循环，焦点不会逃到背景页面。
- 打开期间锁定 `document.body` 滚动，关闭时恢复原值。
- 所有图标按钮均有 `aria-label`；缩略图使用 `role="tablist"` / `role="tab"` + `aria-selected`。
- 图片 `alt` 复用 `attachment.imageAlt`（「图片预览：文件名」）；加载失败与下载失败均使用 `role="alert"`。
- 键盘映射集中在 `getImageViewerAction()`，单图时左右/Home/End 不拦截，避免无效操作。

## 5. 样式令牌

查看器在 light/dark 下都保持深色媒体层，新增固定媒体令牌（定义在 `globals.css` 的 `:root`）：

- `--ds-media-backdrop`：全屏遮罩底色
- `--ds-media-ink` / `--ds-media-ink-soft`：媒体层文字
- `--ds-media-control-bg` / `--ds-media-control-hover` / `--ds-media-control-border`：半透明控件
- `--ds-media-danger` / `--ds-media-danger-soft`：固定深色层上的错误提示（不随 light/dark 切换）

其余使用既有 `--ds-space-*`、`--ds-radius-*`、`--ds-shadow-*`、`--ds-duration-*`、`--ds-ease-*`。组件与 CSS 不硬编码颜色或间距。

## 6. 验收清单

- [x] 缩放：按钮 / 键盘 / 滚轮 / 双击，范围 1×–4×，百分比实时显示。
- [x] 多图：左右按钮、缩略图、←/→ 循环切换，计数器与选中态同步。
- [x] 键盘：Esc / ← / → / Home / End / + / - / 0。
- [x] 下载：已发送附件走签名下载；失败有行内与 Toast 反馈。
- [x] 关闭：Esc、关闭按钮、点击空白；焦点还原、body 滚动恢复。
- [x] 视觉：全屏深色媒体层、顶栏/缩略图/控件与弹层体系一致；移动端 44px 触控目标。
- [x] 可访问性：dialog 语义、焦点陷阱、aria-label、`role="alert"`、reduced-motion。
- [x] 测试：`src/lib/image-viewer.test.ts`（7 条纯逻辑）+ `src/components/chat/image-viewer.test.tsx`（8 条组件）。
