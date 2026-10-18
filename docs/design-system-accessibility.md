# 无障碍规范（WCAG 2.2）

> 适用版本：v0.1.69（REQ-202610-0497 / UI 改版 · E 交互细节）
> 目标：核心页面在深色 / 浅色双主题下满足 WCAG 2.2 AA 的对比度、键盘操作、语义结构与状态播报要求。

## 1. 覆盖范围

| 页面 / 区域 | 本轮改动 |
| --- | --- |
| 首页 `/` | 跳转主内容链接、标签页键盘模型、表单标签与错误关联、装饰图标隐藏 |
| 房间页 `/room/[roomCode]` | 地标与区域命名、消息日志、成员 / 审批 / 附件列表语义化、菜单键盘导航、轮播暂停 |
| 全局弹层 | 统一 `Dialog`：焦点圈定、Esc 关闭、焦点归还、滚动锁定、可访问名称 |
| 设计令牌 | 双主题文本 / 控件边框 / 焦点环 / 状态色对比度校准 |

不在本轮范围：屏幕阅读器人工听测、第三方嵌入内容、PDF / 图片正文替代文本。

## 2. 设计令牌对比度

实现：`src/app/globals.css`；自动化校验：`src/lib/contrast.test.ts`。

计算口径：WCAG 相对亮度公式，取 `canvas / panel / card / elevated` 四种阅读表面的最小值。普通文本要求 ≥ 4.5:1，控件边界与焦点环要求 ≥ 3:1。

| 令牌 | 深色主题 | 浅色主题 | 用途 |
| --- | ---: | ---: | --- |
| `--ds-ink` | 15.42:1 | 16.72:1 | 主文本 |
| `--ds-ink-soft` | 10.19:1 | 9.99:1 | 次级文本 |
| `--ds-ink-muted` | 7.12:1 | 7.19:1 | 辅助文本 |
| `--ds-ink-faint` | 5.17:1 | 5.87:1 | 弱化文本 |
| `--ds-line-control` | 3.42:1 | 3.77:1 | 输入框 / 控件边界 |
| `--ds-focus-ring` | 10.19:1 | 16.72:1 | 键盘焦点环 |
| `--ds-success` | 8.30:1 | 4.50:1 | 成功状态文本 |
| `--ds-warning` | 11.89:1 | 4.65:1 | 警告状态文本 |
| `--ds-danger` | 4.93:1 | 4.65:1 | 错误状态文本 |
| `--ds-action-fg` / `--ds-action-bg` | 18.38:1 | 18.86:1 | 主按钮文字 / 背景 |

约束：

- 文本令牌不得直接写成 `#8e8e98` 之类的硬编码值，统一走 `--ds-ink-*`；新增令牌必须同时补齐深色与浅色值。
- 焦点环使用实色 `--ds-focus-ring`，不使用低透明度颜色，避免在任意表面上低于 3:1。
- 状态色只用于语义状态，不用于装饰；状态不能只靠颜色表达，必须同时有文字或图标。

## 3. 组件模式

### 3.1 跳转主内容

`src/components/ui/skip-link.tsx` 在 `<body>` 首个可聚焦位置渲染「跳到主内容」，目标为各页面 `<main id="main-content" tabIndex={-1}>`。键盘用户按 Tab 首次即可跳过导航。

### 3.2 模态框

`src/components/ui/dialog.tsx` 统一承载房间入口、二维码、公告编辑 / 查看、图片预览：

- `role="dialog"` + `aria-modal="true"` + `aria-labelledby`（或 `aria-label`）。
- 打开时焦点移入第一个可聚焦元素或 `initialFocusRef`；Tab / Shift+Tab 在面板内循环。
- Esc 只关闭最上层弹层，关闭后焦点回到触发按钮。
- 多弹层叠加时使用栈计数锁定 `body` 滚动，关闭最后一层时恢复原值。
- 遮罩点击可关闭；关闭按钮必须有可访问名称。

### 3.3 标签页与菜单

- 首页标签页：`role="tablist"` / `role="tab"` / `role="tabpanel"`，支持 ArrowLeft / ArrowRight / Home / End，`tabIndex` 只保留当前项。
- 房间菜单、成员菜单：`aria-haspopup="menu"`、`aria-expanded`、`aria-controls`；ArrowUp / ArrowDown / Home / End 移动焦点，Esc 关闭并把焦点还给触发按钮。

### 3.4 动态内容

- 消息列表：`role="log"` + `aria-live="polite"` + `aria-relevant="additions text"`，新消息不会打断当前朗读。
- 发送状态、复制结果、轮播页码使用 `sr-only` + `role="status"`；失败提示使用 `role="alert"`。
- 轮播提供暂停 / 继续按钮，`prefers-reduced-motion: reduce` 时默认暂停，且不自动播放。

### 3.5 表单

- 每个输入框都有可见 `<label htmlFor>` 或包裹式 `<label>`，占位符不能替代标签。
- 错误通过 `aria-invalid` + `aria-describedby` 关联到 `FieldError`，错误节点使用 `role="alert"`。
- 字符计数通过 `aria-describedby` 关联，并带本地化 `aria-label`。
- 图标按钮必须有 `aria-label`；纯装饰图标统一 `aria-hidden="true"`。

### 3.6 语义结构

- 页面使用 `<main>`、`<nav>`、`<aside>`、`<section>`、`<ul>/<li>`、`<article>`、`<time dateTime>`。
- 图标按钮不承担标题语义；标题层级按页面结构使用 `<h1>` / `<h2>`。
- 当前房间链接使用 `aria-current="page"`，并补充屏幕阅读器可见的「当前房间」文本。

## 4. 自动化测试

| 文件 | 覆盖 |
| --- | --- |
| `src/lib/contrast.test.ts` | WCAG 亮度 / 对比度公式、CSS 变量解析、双主题 9 类令牌阈值（23 条） |
| `src/lib/a11y.test.ts` | Tab 循环、菜单方向键 / Home / End、`aria-describedby` 合并（8 条） |

运行：

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
```

## 5. 人工验收清单

- [ ] 仅用键盘完成：跳过导航 → 切换加入 / 创建 → 提交表单 → 打开房间菜单 → 关闭弹层，焦点始终可见且可预测。
- [ ] 打开任一弹层后，Tab 不会跑到背景内容；Esc 关闭后焦点回到原触发按钮。
- [ ] 深色 / 浅色主题下检查正文、辅助文字、输入框边界、焦点环、成功 / 警告 / 错误提示。
- [ ] 开启系统「减少动态效果」后，轮播不自动播放，页面动画不引起不适。
- [ ] 使用 VoiceOver / NVDA 抽查：标签页名称、消息日志播报、成员菜单项名称、图片预览按钮名称。
- [ ] 浏览器缩放 200% / 400% 时内容不重叠、不截断，操作仍可完成。

## 6. 已知限制

- 自动化测试校验的是设计令牌而非最终渲染像素；半透明叠色、图片背景上的文字仍需人工复核。
- 第三方浏览器扩展注入的 DOM 不在覆盖范围。
- 屏幕阅读器实际播报顺序受浏览器与 AT 组合影响，发布前建议至少完成一次 VoiceOver（Safari）与 NVDA（Chrome）抽测。
