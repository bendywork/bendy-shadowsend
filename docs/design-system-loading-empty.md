# 加载与空状态规范（ui-13）

> 对应需求：REQ-202610-0476 · 路线图 `docs/development-plan-2026-10-13-roadmap.md` §3.2 ui-13
> 适用范围：全站列表、消息流、成员/审批面板、首页身份卡。

## 1. 目标

- 用**骨架屏**替代文字占位与孤立 spinner，让首屏结构与真实内容一致，减少布局跳动。
- 用统一的**空态组件**收敛散落的「暂无」「空」文案、边框与内边距。
- 所有加载/空态均具备可访问语义，并遵守动效与主题令牌约束。

## 2. 骨架屏

实现：`src/components/ui/skeleton.tsx`

| 组件 | 用途 | 结构 |
| --- | --- | --- |
| `Skeleton` | 基础块 | `aria-hidden`，支持宽高与 `sm/md/lg/full` 圆角 |
| `SkeletonText` | 多行文本占位 | 末行 62% 宽，形成自然段落感 |
| `SkeletonAvatar` | 头像/图标占位 | 圆形，尺寸可配 |
| `RoomListSkeleton` | 左侧房间列表 | 图标块 + 标题/房号两行 |
| `MessageListSkeleton` | 消息流 | 头像 + 气泡，左右交替模拟对话 |
| `MemberListSkeleton` | 右侧成员栏 | 头像 + 昵称/角色两行 + 操作位 |
| `HomeIdentitySkeleton` | 首页身份卡 | 40px 头像 + 两行文本 |
| `RoomPageSkeleton` | 房间页首屏 | 三栏骨架：房间列表 / 消息流 / 成员栏 |

规则：

- 组合骨架容器使用 `role="status"`、`aria-live="polite"`、`aria-busy="true"`，并通过 `.sr-only` 提供「正在加载…」文案。
- 骨架块本身 `aria-hidden="true"`，避免读屏逐块播报。
- 骨架数量默认 3–6 行；真实列表通常一屏可见 4–6 项。
- 加载完成后直接替换为真实内容，不保留骨架占位。

## 3. 空态

实现：`src/components/ui/empty-state.tsx`

```
EmptyState
├── 插画（variant: rooms / messages / members / approvals / generic）
├── 标题（必填）
├── 描述（可选）
└── 动作（可选，单个主/次按钮）
```

规则：

- **插画**：内联 SVG 线稿，`currentColor` 继承 `--ds-ink-faint`，不引入图片资源；`aria-hidden`。
- **文案**：标题说明「没有什么」，描述说明「下一步会发生什么」；全部走 i18n key（`empty.*`）。
- **动作**：只在能直接推进流程时提供（如空消息流的「发送第一条消息」聚焦输入框）；无动作时不渲染动作容器。
- **紧凑模式**：`compact` 用于侧栏/面板内的空态（房间列表、成员、审批），插画缩至 44×32。
- 空态背景使用 `bg-panel/40` 等 surface 令牌，不加装饰性描边。

## 4. 接入点

- 首页：身份卡加载态使用 `HomeIdentitySkeleton`；房间计数加载态使用 `Skeleton`。
- 房间页首屏：`loading` 时渲染 `RoomPageSkeleton`（三栏）。
- 左侧房间列表：`RoomLinks` 空分组使用 `EmptyState variant="rooms" compact`。
- 消息流：无消息时使用 `EmptyState variant="messages"`，动作聚焦 composer。
- 成员栏：无成员时使用 `EmptyState variant="members" compact`。
- 审批列表：无待审批时使用 `EmptyState variant="approvals" compact`。

## 5. 动效与主题

- `.skeleton` 使用 `::after` 渐变扫光，仅动画 `transform`；不改变宽高、位置或外边距。
- 时长 1.6s，缓动 `--ds-ease-standard`。
- `prefers-reduced-motion: reduce` 下关闭扫光。
- 所有颜色/圆角/间距来自 `--ds-*` 令牌，深浅主题自动适配。

## 6. 验收清单

- [ ] 首页身份卡与房间计数在加载时显示骨架，加载完成后无布局跳动。
- [ ] 房间页首屏出现三栏骨架，而非孤立 spinner。
- [ ] 房间列表空分组、消息流、成员、审批均使用统一空态组件。
- [ ] 空消息流动作可聚焦 composer，键盘可达。
- [ ] 读屏可感知加载状态（`role=status` + `aria-busy`），骨架块不被逐块播报。
- [ ] 深浅主题下骨架与空态对比度正常，无横向溢出（390 / 1440）。
- [ ] `prefers-reduced-motion` 下无扫光动画。
