# 成员操作菜单与确认体系（REQ-202610-0490 / ui-27）

## 1. 背景与目标

房间页右侧成员列表原先使用手写的绝对定位菜单：菜单面板与按钮样式散落在页面内，两个动作（房主转让 / 移除房间）没有分组，危险动作与常规动作视觉权重相同，且点击后直接走 `window.confirm`。

本次将成员菜单收敛为共享菜单原语，并建立「常规操作 / 危险操作」分组；危险动作统一通过可复用的确认对话框二次确认，为 ui-28 的全站确认体系提供落地基础。

## 2. 组件与 API

### 2.1 `src/components/ui/menu.tsx`

- `Menu`：受控浮层，portal 到 `document.body`，基于锚点元素计算 fixed 位置；空间不足时自动向上翻转并夹取到视口内。
- `MenuGroup`：`role="group"` + `aria-labelledby`，用于常规/危险分组标题。
- `MenuItem`：`role="menuitem"`，支持 `icon`、`danger`、`disabled`、`onSelect`；危险项使用 `.menu-item--danger`。
- `MenuSeparator`：`role="separator"`，分隔不同分组。
- `MenuSurface`：菜单面板的纯展示层，便于服务端渲染测试。

### 2.2 `src/components/ui/confirm-dialog.tsx`

- `ConfirmDialog`：受控确认对话框，portal 到 body，`role="alertdialog"` + `aria-modal="true"`。
- `ConfirmDialogContent`：纯展示层，接收标题、描述、按钮文案、`tone` 与 `busy`。
- 打开时聚焦「取消」按钮（危险操作的安全默认），Tab 焦点圈定，Esc/遮罩取消，关闭后焦点归还触发元素。
- `busy` 期间两个按钮均禁用并设置 `aria-busy`，避免重复提交。

### 2.3 `src/lib/menu.ts`

- `computeMenuPosition(anchor, menu, viewport, align)`：纯函数，返回 `top / left / placement`。
- 规则：默认下方 6px；下方放不下且上方放得下时翻转；左右按 `start` / `end` 对齐后夹取到 8px 视口内边距。

## 3. 成员菜单结构

```text
成员操作（MoreHorizontal）
├─ 常规操作
│  └─ 房主转让
├─ ─────────
└─ 危险操作
   └─ 移除房间（danger）
```

- 仅房主且目标不是房主本人时展示入口。
- 点击动作后菜单关闭，危险动作弹出确认对话框：
  - 房主转让：标题「转让房主」，描述包含成员昵称与「你将变为普通成员」。
  - 移除房间：标题「移除成员」，描述包含成员昵称。
- 确认后调用既有接口；失败继续走统一 `toastError`，成功走 Toast。

## 4. 交互与可访问性

- 触发器：`aria-haspopup="menu"`、`aria-expanded`、本地化 `aria-label`。
- 菜单：`role="menu"`，分组 `role="group"`，分隔 `role="separator"`，条目 `role="menuitem"`。
- 键盘：`ArrowDown` / `ArrowUp` 循环移动，`Home` / `End` 跳转，`Enter` / `Space` 激活，`Esc` 关闭，`Tab` 关闭并交还焦点。
- 点击菜单外部或页面滚动/缩放时关闭；关闭后焦点回到触发器。
- 危险项同时使用危险色、危险背景与分组标题，状态不只依赖颜色。
- 动画仅使用 `opacity` / `transform`；`prefers-reduced-motion` 下关闭菜单入场动画。

## 5. 视觉规范

- 菜单面板：`--ds-surface-panel` + `--ds-line` 描边 + `--ds-shadow-lg`，圆角 `--ds-radius-md`。
- 分组标题：10px / 600 / 大写 / `--ds-ink-faint`。
- 菜单项：12px，图标 14px，hover 使用 `--ds-action-soft`；危险项使用 `--ds-danger` 与 `--ds-danger-soft`。
- 确认对话框：`--ds-surface-panel` 面板、`--ds-overlay` 遮罩、危险确认按钮复用 `.btn-danger`。

## 6. 与 ui-28 的衔接

本次已把成员菜单内的「房主转让 / 移除房间」从 `window.confirm` 迁移到共享 `ConfirmDialog`。ui-28 后续可将同一组件复用于解散房间、退出房间等剩余入口，并按其需求补充全局确认服务；成员菜单无需再次改造。

## 7. 测试与验收

- `src/lib/menu.test.ts`：7 条定位纯函数测试（下方/上方翻转、左右夹取、start/end 对齐、超高菜单）。
- `src/components/ui/menu.test.tsx`：3 条 SSR 测试（分组、分隔、危险类、禁用态）。
- `src/components/ui/confirm-dialog.test.tsx`：3 条 SSR 测试（alertdialog 关联、危险/普通按钮、busy 禁用）。
- `npm test`：6 个测试文件、37 条用例全部通过。
- `npm run lint`：0 error。
- `npx tsc --noEmit`：0 error。
- `npm run build`：Next.js 16.2.1 生产构建通过。

### 人工验收清单

- [ ] 房主在成员行点击「更多」打开菜单，常规/危险分组与分隔线清晰。
- [ ] 点击「房主转让」弹出确认框，取消后无请求；确认后房主变更并 Toast。
- [ ] 点击「移除房间」弹出危险确认框，取消后无请求；确认后成员移除并 Toast。
- [ ] 菜单键盘操作：方向键、Home/End、Enter、Esc 均符合预期，焦点不逃逸。
- [ ] 窄屏（375px）与页面底部成员行打开菜单时不超出视口。
- [ ] 深色/浅色主题下分组标题、危险项与确认框对比度正常。
- [ ] `prefers-reduced-motion` 下无菜单入场动画。
