# 按钮体系规范（v0.1.66 / REQ-202610-0466）

本文件是 A 设计基座阶段一的按钮落地口径，依赖 0464 建立的黑白灰设计令牌（`--ds-*`）。所有交互按钮必须走本体系，不再手写配色与尺寸。

## 1. 四级语义

| 级别 | 类名 / 组件 | 用途 | 配色（dc-02） |
| --- | --- | --- | --- |
| 主按钮 | `.btn--primary` / `<Button variant="primary">` | 当前视图唯一主行动：进入、创建、发送、保存 | 反色：深色主题浅底深字，浅色主题深底白字 |
| 次按钮 | `.btn--secondary` / `<Button variant="secondary">` | 并列或次要行动：取消之外的确认、复制、设置保存 | 抬升表面 + 细边框 |
| 幽灵按钮 | `.btn--ghost` / `<Button variant="ghost">` | 低权重行动：展开、关闭、面板内辅助操作 | 透明底，hover 出浅灰底 |
| 危险按钮 | `.btn--danger` / `<Button variant="danger">` | 不可逆破坏性操作：解散、删除 | 语义红，唯一允许的彩色常规按钮 |

规则：

- 同一屏最多一个 `primary`；出现两个时降级为 `secondary`。
- 危险操作优先收进「更多」菜单并以 `.menu-item--danger` 呈现；只有确认弹窗的最终按钮使用 `danger`。
- 普通操作禁止使用红色、蓝色或品牌色；颜色只表达语义状态。

## 2. 两档尺寸

| 尺寸 | 控件高度 | 内边距 | 字号 | 场景 |
| --- | --- | --- | --- | --- |
| `sm` | `--ds-control-sm`（32px） | `--ds-space-3` | 12px / 500 | 工具栏、列表行、面板内、图标按钮 |
| `md` | `--ds-control-md`（40px） | `--ds-space-4` | 14px / 600 | 表单提交、弹窗主行动、页面级入口 |

- 尺寸只允许 `sm` / `md`，不再新增 `xs` / `lg`。
- 同一行内的文本按钮与图标按钮必须同档，避免 32px 与 40px 混排。
- 图标按钮：`.icon-btn--sm` 32×32，`.icon-btn--md` 40×40；圆角分别对应 `--ds-radius-sm` / `--ds-radius-md`。

## 3. 状态

- `loading`：组件自动 `disabled`，设置 `aria-busy="true"` 与 `data-loading="true"`，图标位置替换为 `.btn__spinner`（`LoaderCircle` + `ds-spin`）。
- `disabled`：`opacity: 0.45`，`cursor: not-allowed`；禁止只改颜色而保留可点击。
- `active`（仅 IconButton）：用于开关/面板已展开，背景为 `--ds-action-soft`。
- hover / focus-visible / active 均由 token 驱动；`prefers-reduced-motion` 下关闭位移动画。
- 加载文案与静态文案使用同一 i18n key，避免布局跳动。

## 4. 组件用法

```tsx
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";

<Button type="submit" variant="primary" size="md" block loading={submitting}>
  创建并进入
</Button>

<Button variant="secondary" size="sm" icon={<Copy className="h-3.5 w-3.5" />}>
  复制
</Button>

<IconButton size="sm" aria-label="更多" aria-haspopup="menu" active={open}>
  <MoreHorizontal className="h-4 w-4" />
</IconButton>
```

约束：

- 文本按钮用 `<Button>`；纯图标按钮用 `<IconButton>`，必须提供 `aria-label` 或 `aria-labelledby`。
- 图标按钮配合 `<Tooltip>` 使用；菜单触发器补 `aria-haspopup` / `aria-expanded`。
- 文件选择等无法使用 `<button>` 的场景，使用 `className="btn btn--secondary btn--sm"` 挂在 `<label>` 上，内部 `<input type="file" className="hidden">`。
- 链接需要按钮外观时使用 `className="btn btn--secondary btn--md"`，保留 `<Link>` 的语义。
- 禁止在业务代码中出现 `btn-primary`、手写 `rounded-lg bg-elevated-strong px-3 py-1.5` 等旧写法。

## 5. 低频操作收敛

- 顶栏只保留高频入口：邀请、二维码、成员面板、更多。
- 公告、房间设置、解散房间收进「更多」菜单；移动端导航/成员入口保持幽灵按钮。
- 列表行内的低频操作（房主转让、移除成员）收进行尾 `IconButton` 菜单，不再并排铺按钮。

## 6. 验收清单

- [ ] 全仓无 `.btn-primary` / `.btn-secondary` / `.btn-ghost` / `.btn-danger` / `.btn-sm` / `.btn-md` 旧类。
- [ ] 主按钮在 light/dark 下均为反色，彩色仅出现在 danger 与语义状态提示。
- [ ] 所有按钮具备 hover / focus-visible / active / disabled 状态。
- [ ] loading 按钮不可重复提交，且保留原宽度（spinner 与图标同尺寸）。
- [ ] 同一行按钮尺寸一致；图标按钮为正方形。
- [ ] `npm run lint`、`npm test`、`npm run build` 通过。
