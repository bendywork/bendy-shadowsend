# 全站强调色清理规范（黑白灰 + 反色按钮）

> 适用版本：v0.1.69（REQ-202610-0749 / ui-49，dc-02 = A）
> 目标：全站只保留黑白灰与语义状态色；主按钮在双主题下反色；任何服务端数据或历史数据都不能重新引入彩色强调色。

## 1. 颜色使用边界

| 类别 | 允许值 | 使用位置 |
| --- | --- | --- |
| 中性色 / 表面 / 线条 / 文字 | `--ds-gray-0..9` 与 `--ds-surface-*`、`--ds-line-*`、`--ds-ink-*` | 所有页面与组件 |
| 主操作按钮 | `--ds-action-bg` / `--ds-action-fg` | `.btn-primary` 及同语义按钮 |
| 语义状态 | `--ds-success`、`--ds-warning`、`--ds-danger` 及其 soft/glow 变体 | 成功/警告/错误反馈、危险操作 |
| 头像 | `AVATAR_COLOR_POOL` 中性灰 | 用户头像兜底与新建用户 |
| 广告文字 | `--ds-ink-soft` | 房间广告轮播 |

禁止：

- 遗留系统蓝 `#0a84ff`、`#0071e3` 及其 `rgb()` 形式。
- Tailwind 默认调色板工具类（`bg-blue-500`、`text-red-400`、`border-slate-200` 等）。
- `globals.css` / `avatar-color.ts` 之外硬编码任何颜色字面量。
- React 元素上的内联文字颜色（`style={{ color: ... }}`）。
- `globals.css` 中的 `!important` 覆写。

## 2. 主按钮反色契约

| 主题 | 背景 | 文字 | 要求 |
| --- | --- | --- | --- |
| 深色（默认 `:root`） | 浅色 `--ds-action-bg: #f5f5f7` | 深色 `--ds-action-fg: #08080a` | 背景亮度 > 文字亮度，对比度 ≥ 4.5:1 |
| 浅色（`:root[data-theme="light"]`） | 深色 `--ds-action-bg: #111113` | 浅色 `--ds-action-fg: #ffffff` | 背景亮度 < 文字亮度，对比度 ≥ 4.5:1 |

hover 只提升背景对比（深色主题更白、浅色主题更黑），active 轻微缩放，均不改变反色关系。

## 3. 运行时数据兜底

服务端与数据库可能残留旧版本写入的颜色，渲染层必须做最后一道校验：

- **广告位**：`parseAdBoardItems()` 只保留 `content` 与 `url`，Zod 自动剥离历史 `color` 字段；轮播文字固定使用 `text-ink-soft`。
- **头像**：`resolveAvatarColor(color, seed)` 仅接受 RGB 通道差 ≤ 24 的中性色；彩色、短横线、非法值一律回落到由 `seed` 稳定哈希出的 `AVATAR_COLOR_POOL` 项，保证同一用户每次渲染颜色一致。
- 新建用户的 `avatarColor` 直接来自 `AVATAR_COLOR_POOL`，不再生成随机彩色。

## 4. 防回归审计

`npm run accent:audit` 扫描 `src/**/*.{ts,tsx,css}`（排除测试文件）：

1. 遗留系统蓝（hex / rgb）。
2. Tailwind 默认调色板工具类。
3. 令牌文件之外的硬编码颜色。
4. 内联文字颜色。
5. `globals.css` / `avatar-color.ts` 中的非中性、非语义色。
6. `globals.css` 中的 `!important`。
7. 主按钮反色方向与 WCAG AA 对比度。

`npm run test:accent` 为审计脚本本身提供 9 条单测，覆盖上述规则与“仓库当前 0 违规”的断言。

## 5. 验收清单

- [x] `src` 内无 `#0a84ff` / `#0071e3` 残留。
- [x] 无 Tailwind 默认调色板工具类。
- [x] 广告 `color` 字段从 schema / 类型 / 渲染链路移除，历史数据被忽略。
- [x] 头像历史彩色值全部回落到中性灰。
- [x] 深色 / 浅色主题主按钮均为反色且对比度 ≥ 4.5:1。
- [x] 语义状态色仅用于成功 / 警告 / 错误反馈。
- [x] `npm run accent:audit` 与 `npm run test:accent` 均通过。
