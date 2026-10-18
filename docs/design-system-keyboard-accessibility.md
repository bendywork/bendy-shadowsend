# 键盘可达性规范（焦点 / Esc / Enter）

> 适用版本：v0.1.69（REQ-202610-0496 / 阶段三）
> 目标：所有核心操作可只用键盘完成；焦点始终可见、可预测、可归还；弹层与菜单不把键盘用户困住。

## 1. 全局约定

- **焦点可见**：`:focus-visible` 统一使用 `--ds-focus-ring` 2px 外轮廓 + 2px offset。输入框不再用 `outline-none` 抹掉键盘焦点。
- **跳过导航**：每个页面首个可聚焦元素是「跳到主要内容」，目标为 `#main-content`（带 `tabIndex=-1`）。鼠标用户看不到，Tab 首次按下时出现。
- **不劫持输入**：输入法组合期间（`isComposing` / `keyCode 229`）不响应 Enter 发送；Shift+Enter、Alt+Enter 始终换行。
- **焦点归还**：任何临时浮层关闭后，焦点回到打开它的触发元素；触发元素已从 DOM 移除时保持当前焦点不动。
- **动画约束**：浮层入场只动 `opacity` / `transform`；`prefers-reduced-motion: reduce` 下全部关闭。

## 2. 快捷键契约

| 场景 | 按键 | 行为 |
| --- | --- | --- |
| 消息输入框 | `Enter` | 「回车发送」开启时发送；关闭时换行 |
| 消息输入框 | `Shift+Enter` | 换行（任何模式下） |
| 消息输入框 | `Ctrl+Enter` / `⌘+Enter` | 发送（即使关闭了「回车发送」） |
| 消息输入框 | `Alt+Enter` | 换行 |
| 输入法组合中 | `Enter` | 交给输入法确认候选词，不发送 |
| 对话框 | `Esc` | 关闭最上层对话框；提交中（closeDisabled）不关闭 |
| 对话框 | `Tab` / `Shift+Tab` | 在对话框内循环，不跑到背景页面 |
| 菜单 | `ArrowDown` / `ArrowUp` | 下一项 / 上一项，首尾循环 |
| 菜单 | `Home` / `End` | 首项 / 末项 |
| 菜单 | `Esc` / `Tab` | 关闭菜单并归还焦点 |

输入框与发送按钮均声明 `aria-keyshortcuts`，输入框通过 `aria-describedby` 关联快捷键提示。

## 3. 实现分层

| 文件 | 职责 |
| --- | --- |
| `src/lib/keyboard.ts` | 纯函数：Enter 发送判定、菜单索引、Tab 焦点陷阱索引、可聚焦选择器 |
| `src/lib/use-dialog-keyboard.ts` | 对话框 hook：初始焦点、Tab 循环、Esc、滚动锁定、多层栈、焦点归还 |
| `src/lib/use-menu-keyboard.ts` | 菜单 hook：初始聚焦首项、方向键/Home/End、Esc/Tab 关闭、焦点归还 |
| `src/components/ui/modal.tsx` | 页面级模态外壳：`role=dialog` / `aria-modal` / `aria-labelledby` / 遮罩关闭 |
| `src/components/ui/popover.tsx` | 轻量设置面板，复用同一对话框 hook |
| `src/components/ui/skip-link.tsx` | 跳过导航链接 |

### 3.1 对话框接入

```tsx
<Modal
  open={open}
  onClose={close}
  title={t("settings.title")}
  description={optionalDescription}
  size="md"
  closeLabel={t("common.close")}
  closeDisabled={submitting}
>
  <input data-autofocus aria-label={t("settings.roomName")} />
</Modal>
```

- 初始焦点优先 `[data-autofocus]`，否则首个可聚焦元素，最后回退到面板本身。
- 背景滚动锁定会补偿滚动条宽度，避免页面横向跳动。
- 嵌套弹层（如公告编辑 → 图片查看器）使用栈：只有最上层响应 Esc/Tab，关闭后焦点回到上一层内的触发图片。

### 3.2 菜单接入

```tsx
const menuRef = useRef<HTMLDivElement | null>(null);
useMenuKeyboard({ active: open, containerRef: menuRef, onClose: close });

<div ref={menuRef} role="menu" aria-label={t("members.actions")} tabIndex={-1}>
  <button type="button" role="menuitem" tabIndex={-1}>…</button>
</div>
```

菜单项使用 `tabIndex=-1` 的 roving focus 模式：Tab 不逐项停留，方向键在项间移动。

## 4. 已覆盖界面

- 房间入口（创建 / 加入）模态：初始聚焦首个输入框、Esc/遮罩关闭、提交中禁止关闭、Tab 圈定。
- 二维码模态、公告编辑模态、公告阅读模态、图片查看器：统一 `Modal` 语义与焦点管理。
- 房间设置 Popover：初始聚焦房间名称输入框，Tab 圈定，关闭归还触发按钮。
- 房间列表「退出房间」菜单、成员「转让房主 / 移出房间」菜单：方向键导航与焦点归还。
- 消息图片：由双击改为可聚焦按钮，Enter/Space 打开图片查看器，并提供 `aria-label`。
- 消息输入框：label、快捷键提示、`aria-keyshortcuts`、发送后焦点回到输入框。

## 5. 验收清单

- [ ] 只用 Tab 可依次到达跳过链接、页头按钮、侧栏、消息区、输入框、发送按钮。
- [ ] 每个可交互控件在键盘聚焦时有清晰可见的 2px 焦点环。
- [ ] 打开任一对话框后，Tab / Shift+Tab 不会离开对话框；Esc 关闭并回到触发按钮。
- [ ] 公告编辑中打开图片查看器，Esc 只关闭图片查看器，再按 Esc 关闭公告编辑。
- [ ] 消息输入框：Enter 发送；Shift+Enter 换行；Ctrl/⌘+Enter 在关闭「回车发送」时仍可发送。
- [ ] 中文输入法选词时按 Enter 不误发送。
- [ ] 菜单打开后可用方向键、Home、End 移动；Esc 关闭后焦点回到「…」按钮。
- [ ] 发送消息后焦点仍在输入框，可直接继续输入。
- [ ] 关闭动画/减少动态效果设置下，浮层仍可用且不播放动画。
