# Surface 层级与边框规范

> 对应需求：REQ-202610-0465「边框收敛与层级规范」（UI 改版 · A 设计基座 · ui-02）
>
> 原则：**层级靠背景分层、留白与轻投影表达，而不是靠描边。**

## 1. 层级定义

| 层级 | 令牌 / 类名 | 用途 | 典型场景 |
| --- | --- | --- | --- |
| base | `--bg-base` / `.surface-base` | 页面画布，最低层 | 聊天页中间会话区、首页 body |
| panel | `--bg-panel` / `.surface-panel` | 结构性区域，与画布区分但不抢内容 | 左侧房间栏、右侧成员栏、顶栏 / 输入区所在面板 |
| card | `--bg-card` / `.surface-card` | 承载内容的卡片，浮在 base/panel 之上 | 首页入口卡、等待审批卡、消息气泡 |
| overlay | `--bg-overlay` / `.surface-overlay` | 临时浮层，最高层 | Modal、Drawer、Popover、菜单、Toast、Tooltip |
| inset | `--surface-inset` / `.surface-inset` | 卡片/面板内部的次级区块 | 身份卡、设置分组、成员卡、附件卡、空态、提示条 |

### 1.1 深度阶梯（深色 / 浅色）

| 层级 | 深色 | 浅色 |
| --- | --- | --- |
| base | `#0a0a0c` | `#f5f5f7` |
| panel | `#141417` | `#ececf0` |
| card | `#1c1c20` | `#ffffff` |
| overlay | `#202025` | `#ffffff` |
| inset | 白色 4% | 黑色 3.5% |

> 深色主题由暗到亮逐级抬升；浅色主题由灰到白逐级抬升。相邻层级至少保持一档背景差，禁止同色叠同色后再用描边区分。

## 2. 使用规则

1. **一个区域只用一个 surface 层级**。卡片内部再分组时用 `inset`，不要嵌套第二层 `card`。
2. **不再用 `border` 表达层级**。页面与组件代码中禁止出现 `border border-zinc-*`、`border-zinc-800` 这类装饰性描边。
3. **保留描边的仅有三类**：
   - 输入聚焦：`.field:focus`（`--border-strong` + 柔和外环）；
   - 危险操作：`.surface-danger`（`--border-danger`）；
   - 上传投放区：`.dropzone`（虚线是「可投放」的功能提示）。
4. **分隔线只在同层相邻区域需要时使用**：`.hairline-b` / `.hairline-t`，颜色为 `--border-subtle`，不使用实色 `zinc` 边框。
5. **阴影只用于表达高度**：`card` 用 `--shadow-card`，`overlay` 用 `--shadow-overlay`；`inset` 不加阴影。
6. **交互态用背景变化**：`.surface-control`（默认 inset，hover 升一档）、`.surface-hover`、`.surface-selected`；不要新增边框表示 hover/active。
7. **间距是层级的一部分**：区块之间优先用 12 / 16 / 24px 的间距分组，而不是加线。

## 3. 组件类速查

| 类名 | 说明 |
| --- | --- |
| `.surface-base` | 页面画布背景 |
| `.surface-panel` | 结构栏背景 |
| `.surface-card` | 内容卡（圆角 + 轻投影 + 毛玻璃） |
| `.surface-overlay` | 浮层（圆角 + 深投影 + 毛玻璃） |
| `.surface-inset` | 卡内次级区块背景 |
| `.surface-control` | 中性可点击控件（按钮 / 图标按钮 / 输入触发） |
| `.surface-hover` | 仅提供 hover 背景变化 |
| `.surface-selected` | 选中态背景（替代选中描边） |
| `.surface-danger` | 危险操作容器（唯一保留的红色描边） |
| `.hairline-b` / `.hairline-t` | 同层区域之间的极细分隔 |
| `.message-bubble` / `.message-bubble--own` | 消息气泡：普通 / 己方抬升一档 |
| `.field` | 输入框：默认无可见描边，聚焦时出现 |
| `.composer-shell` | 输入区外壳：聚焦时整体抬升并出现柔和外环 |
| `.dropzone` | 上传投放区：保留虚线功能描边 |

## 4. 验收口径

- 首页与聊天页截图中不出现「每个块都被线框住」的观感。
- 深色 / 浅色两套主题下，base → panel → card → overlay 的层级都能被肉眼区分。
- 键盘聚焦仍清晰可见（输入框、按钮、链接均有 focus-visible 状态）。
- 危险操作（解散、踢人、移除、错误提示）仍有明确的语义色边界。
- 新增组件只能引用上述类与令牌，不得硬编码颜色或新增装饰性描边。
