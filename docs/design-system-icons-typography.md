# 图标与排版规范（ui-07）

> 适用范围：`src/` 下全部前端代码。新增或改版页面必须遵守本文件；`npm run check:ui` 会在 CI / 收尾检查中强制校验。

## 1. 图标规范

### 1.1 唯一入口

业务代码禁止直接导入 `lucide-react`，只能从 `@/components/ui/icons` 具名导入：

```tsx
import { CopyIcon, LoaderCircleIcon } from "@/components/ui/icons";

<CopyIcon />
<LoaderCircleIcon size="sm" className="animate-spin" />
```

`src/components/ui/icons.tsx` 统一完成 lucide 具名封装、尺寸换算、线宽与无障碍属性，新增图标时在该文件内补充导出。

### 1.2 尺寸 token

| token | 像素 | 典型场景 |
| --- | --- | --- |
| `xs` | 12px | 行内状态、徽标、菜单内小图标 |
| `sm` | 14px | 紧凑按钮、chip、消息回执、元信息 |
| `md`（默认） | 16px | 常规按钮、顶栏图标按钮、表单动作 |
| `lg` | 20px | 独立动作、公告标题 |
| `xl` | 24px | 加载态、空状态主图标 |
| `2xl` | 32px | 等待/错误页等大号空态 |

规则：

- 不再使用 `h-*` / `w-*` 工具类控制图标尺寸，一律传 `size`。
- 图标默认 `strokeWidth = 1.75px`，通过 24 视图坐标换算，保证 12–32px 各档视觉线宽一致。
- 禁止混用 lucide 默认线宽（2px）或任意自定值；确需调整时在封装层统一改 `ICON_STROKE_WIDTH`。

### 1.3 无障碍

- 纯装饰图标默认 `aria-hidden="true"`、`focusable="false"`。
- 有语义的独立图标传 `label`，封装会自动补 `role="img"` 与 `aria-label`。
- 图标按钮本身必须有 `aria-label`（可配合 `Tooltip`）。

## 2. 排版规范

### 2.1 字阶

| 语义类 | 字号 / 行高（移动） | 字号 / 行高（≥640px） | 字重 | 字距 | 用途 |
| --- | --- | --- | --- | --- | --- |
| `.type-display` | 28 / 36 | 36 / 44 | 600 | -0.02em | 首页主标语 |
| `.type-title` | 22 / 30 | 24 / 32 | 600 | -0.01em | 页面/房间主标题 |
| `.type-heading` | 18 / 28 | 同左 | 600 | -0.005em | 区块标题、成员列表标题 |
| `.type-subheading` | 16 / 24 | 同左 | 500 | 0 | 弹层标题、引导说明 |
| `.type-body` | 14 / 24 | 同左 | 400 | 0 | 正文、消息、表单值 |
| `.type-body-sm` | 13 / 20 | 同左 | 400 | 0 | 次要正文、提示条 |
| `.type-caption` | 12 / 18 | 同左 | 400 | 0.01em | 标签、元信息、辅助说明 |
| `.type-micro` | 11 / 16 | 同左 | 500 | 0.02em | 徽标计数、极简元信息 |
| `.type-overline` | 11 / 16 | 同左 | 500 | 0.14em + 大写 | 分组标题、英文 eyebrow |

规则：

- 新代码只使用语义类，不再写 `text-xs` / `text-sm` / `text-[11px]` / `leading-*` 等零散字号行高。
- 字重仅保留 400 / 500 / 600 三档；不再使用 `font-bold`（700）。
- 中文正文行高统一 24px（1.71），避免 1.4 以下的拥挤行距。
- 标题类使用 `text-wrap: balance`，正文保持自然换行。

### 2.2 数字等宽

所有数字型内容加 `.type-numeric`（`font-variant-numeric: tabular-nums`）：

- 房间号、成员数、在线数、版本号
- 时间戳、消息回执时间
- 上传进度、字符计数、文件大小
- 门禁码、统计值、徽标计数

```tsx
<span className="type-numeric">{snap.stats.roomOnline}</span>
<time className="type-numeric">{fmt(createdAt)}</time>
```

## 3. 落地检查

```bash
npm run check:ui   # 禁止直连 lucide / 禁止图标 h-w 尺寸 / token 与版本一致性
npm test           # 图标封装与排版 token 单测（Vitest）
npm run lint
npm run build
```

改动涉及新页面或组件时，至少覆盖：

1. 深浅双主题下标题/正文/辅助文字层级清晰，无字号跳级。
2. 图标尺寸只出现 12/14/16/20/24/32 六档，线宽观感一致。
3. 数字列（统计、时间、计数）切换数据时宽度不跳动。
4. 键盘聚焦时图标按钮仍可见 focus ring，装饰图标不进入无障碍树。
