# 响应式断点规范（REQ-202610-0502 / ui-39）

> 适用范围：房间页及后续所有双栏/三栏页面。断点值以 `src/lib/responsive.ts` 与 `src/app/globals.css` 的 `--breakpoint-*` 为准，`src/lib/responsive.test.ts` 会校验两侧一致。

## 1. 断点矩阵

| 名称 | 视口宽度 | Tailwind | 布局模式 |
| --- | --- | --- | --- |
| mobile | `< 768px` | 默认 | 单栏 |
| tablet | `768px – 1279px` | `md` | 两栏 |
| desktop | `>= 1280px` | `xl` | 三栏 |

- `sm`（640px）与 `lg`（1024px）仅作为局部排版微调，不改变房间页的栏数。
- 断点按 CSS 像素计算；`767.98px` / `1279.98px` 的上界写法避免 1px 重叠。
- 不允许在组件中硬编码断点数值，JS 侧统一使用 `BREAKPOINTS` / `getLayoutMode()`。

## 2. 房间页布局矩阵

| 区域 | mobile | tablet | desktop |
| --- | --- | --- | --- |
| 房间列表 | 左侧抽屉 | 固定左栏 280px | 可折叠左栏 290px |
| 聊天区 | 单栏主体 | 自适应剩余宽度 | 自适应剩余宽度 |
| 成员列表 | 右侧抽屉 | 右侧抽屉 | 可折叠右栏 290px |
| 导航折叠按钮 | 隐藏 | 隐藏 | 显示 |
| 抽屉触发按钮 | 显示 | 仅成员 | 隐藏（用栏内折叠按钮） |

桌面列宽由内联变量 `--room-desktop-grid` 驱动，取值来自 `getDesktopGridTemplate(roomsVisible, membersVisible)`；三栏/两栏/单栏四种组合均有单测覆盖。

## 3. 抽屉契约

房间列表（左）与成员列表（右）在抽屉模式下必须满足：

1. **入口**：触发按钮带 `aria-controls`、`aria-expanded`，文案来自 i18n（`nav.openDrawer` / `members.openDrawer`）。
2. **遮罩**：打开时渲染 `.room-drawer-backdrop`，点击遮罩关闭；桌面宽度下强制 `display: none`。
3. **Esc**：按 Esc 关闭当前抽屉。
4. **焦点**：打开后焦点移入面板（优先 `[data-drawer-autofocus]`，否则第一个可聚焦元素）；Tab / Shift+Tab 在面板内循环；关闭后焦点归还触发元素。
5. **滚动**：打开时锁定 `body` 滚动并补偿滚动条宽度；面板自身 `overscroll-behavior: contain`。
6. **安全区**：面板上下内边距使用 `max(--ds-space-4, env(safe-area-inset-*))`，适配刘海屏与手势条。
7. **关闭入口**：抽屉内提供 `room-drawer-close` 按钮，移动端可见；桌面端同一位置为折叠按钮。
8. **动效**：只改变 `transform` 与 `opacity`；`prefers-reduced-motion: reduce` 下取消过渡与遮罩动画。

实现位置：

- `src/lib/use-drawer-focus.ts`：滚动锁定、焦点圈定、Esc、焦点归还。
- `src/lib/use-layout-mode.ts`：`resize` / `orientationchange` 时按 `requestAnimationFrame` 更新布局模式。
- `src/app/responsive.css`：媒体查询、抽屉位移、遮罩、触摸目标与降级动效。
- `src/app/room/[roomCode]/page.tsx`：抽屉状态、`data-open`、入口与关闭按钮。

## 4. 触摸与主题

- `@media (pointer: coarse)` 下 `.room-drawer-trigger`、`.room-drawer-close` 最小 44×44px。
- 抽屉背景使用 `--ds-surface-panel`，遮罩使用 `--ds-overlay`，边框使用 `--ds-line*`；不写死颜色，light/dark 自动跟随 `<html data-theme>`。
- 面板在桌面是普通栏位、在移动端是抽屉，两种形态共用同一份 DOM，避免重复渲染与状态分裂。

## 5. 验收清单（供 ui-46 / ui-48 使用）

### 视觉基线（ui-46）

- [ ] 360×800、768×1024、1440×900 三档截图，light/dark 各一组。
- [ ] 移动端无横向滚动，聊天区高度为 `100dvh`，输入框始终可达。
- [ ] 平板为「房间栏 + 聊天」两栏，成员入口打开右侧抽屉。
- [ ] 桌面三栏齐全；折叠任一栏后剩余栏位自动补满，无空洞。
- [ ] 抽屉遮罩、阴影、圆角与主题令牌一致，无默认组件样式残留。

### 真机与交互（ui-48）

- [ ] iOS Safari / Android Chrome：抽屉打开后背景不滚动，关闭后恢复原滚动位置。
- [ ] 抽屉内 Tab 循环不逃逸；Esc 可关闭；关闭后焦点回到触发按钮。
- [ ] 触摸目标不小于 44px，抽屉边缘不被安全区遮挡。
- [ ] 旋转屏幕（portrait ↔ landscape）后栏数与抽屉状态正确切换；切到桌面宽度时抽屉自动关闭。
- [ ] 开启「减少动态效果」后无位移动画。
- [ ] 双主题下文字、边框、遮罩对比度满足可读性要求。

## 6. 回归命令

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
```
