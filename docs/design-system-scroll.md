# 滚动容器与滚动条规范（REQ-202610-0507 / ui-44）

> 适用范围：所有可滚动区域与滚动条。新增页面或组件时，先按本文选择滚动容器，再写样式；不要再手写 `overflow-y-auto` / `overflow-auto` 或局部 `::-webkit-scrollbar`。

## 1. 设计令牌

令牌定义在 `src/app/globals.css` 的 `:root` 中，浅色主题块只覆盖需要更高对比度的值。`src/app/scroll.css` 只消费令牌，不出现字面颜色。

| 令牌 | 深色（默认） | 浅色 | 用途 |
| --- | --- | --- | --- |
| `--ds-scrollbar-size` | `8px` | 继承 | WebKit 滚动条宽/高 |
| `--ds-scrollbar-thumb` | `color-mix(in srgb, var(--ds-ink-muted) 70%, transparent)` | `var(--ds-ink-muted)` | 滑块默认态 |
| `--ds-scrollbar-thumb-hover` | `var(--ds-ink-muted)` | `var(--ds-ink-soft)` | 滑块 hover/拖动 |
| `--ds-scrollbar-track` | `transparent` | 继承 | 轨道 |
| `--ds-scrollbar-corner` | `transparent` | 继承 | 双轴交汇角 |

`SCROLLBAR_SIZE_PX = 8` 位于 `src/lib/scroll.ts`；`src/lib/scroll.test.ts` 会校验 TS 常量与 CSS 令牌一致，改尺寸时两处同步。

## 2. 滚动容器契约

所有滚动区域必须同时满足：

1. **单一 overflow owner**：一个滚动区域只负责一个方向的滚动；嵌套滚动必须显式声明方向。
2. **可收缩**：`min-width: 0; min-height: 0`，避免 flex/grid 子项把容器撑大而不产生滚动。
3. **滚动链隔离**：`overscroll-behavior: contain`（单轴变体只在外侧轴设置 `none`），滚动到边界不带动页面。
4. **稳定留白**：`scrollbar-gutter: stable`，滚动条出现/消失不引起内容横向跳动。
5. **键盘可达**：可滚动区域加 `tabIndex={0}`，并用 `role="region"` + `aria-label` 提供名称。
6. **样式统一**：WebKit 伪元素与 Firefox `scrollbar-width` / `scrollbar-color` 都读同一组令牌。

## 3. 工具类

`src/app/scroll.css` 提供以下类，配合 `getScrollAreaClassName(axis)` 使用：

| 类 | overflow | overscroll-behavior | 场景 |
| --- | --- | --- | --- |
| `.scroll-area` | `auto` | `contain` | 基础契约（通常不单独使用） |
| `.scroll-area--y` | `x: hidden / y: auto` | `x: none / y: contain` | 消息、列表、弹层正文 |
| `.scroll-area--x` | `x: auto / y: hidden` | `x: contain / y: none` | 横向标签、横向表格 |
| `.scroll-area--both` | `auto / auto` | `contain` | 二维画布、代码块 |

```tsx
import { getScrollAreaClassName } from "@/lib/scroll";

<div
  className={`${getScrollAreaClassName("y")} min-h-0 flex-1`}
  role="region"
  aria-label={t("scroll.messages")}
  tabIndex={0}
>
  …
</div>
```

键盘聚焦时 `.scroll-area:focus-visible` 显示 2px 内嵌 focus ring（`--ds-focus-ring`），不改变布局尺寸。

## 4. 应用矩阵

| 区域 | 轴 | 说明 |
| --- | --- | --- |
| 房间导航列表 | y | `role="region"` + `scroll.rooms` |
| 消息记录 | y | `role="region"` + `scroll.messages` |
| 成员列表 | y | `role="region"` + `scroll.members` |
| 待审批列表 | y | `role="region"` + `scroll.approvals` |
| 房间入口 / 二维码 / 公告编辑 / 公告阅读 / 图片查看器 | y | 弹层内部滚动，`max-h-[calc(100dvh-2rem)]` |
| Popover 遮罩层 | y | 视口高度不足时整体可滚动 |

弹层必须使用内部滚动而不是让 body 滚动：body 被锁定时，只有弹层自身滚动才能保证底部按钮可达。

## 5. 滚动锁

`src/lib/scroll-lock.ts` 提供引用计数的 body 滚动锁，`src/lib/use-body-scroll-lock.ts` 是 React 绑定：

- 首次 `lock` 保存 `body.style.overflow` / `paddingRight`，设置 `overflow: hidden`，并按 `window.innerWidth - document.documentElement.clientWidth` 补偿滚动条宽度。
- 嵌套弹层只增加计数，不重复保存/覆盖样式；最后一个释放时一次性恢复原值。
- 每个 `release` 幂等，重复调用不会把计数减成负数。
- 房间页的 5 个页面级弹层共用一次 `useBodyScrollLock(Boolean(...))`；`Popover` 内部自行调用，二者叠加时计数正确。

新增弹层时不要手写 `document.body.style.overflow`，直接使用该 hook。

## 6. 可访问性

- 滚动区域必须有可读名称；文案走 i18n（`scroll.*`），禁止硬编码。
- `tabIndex={0}` 只加在真正可滚动的区域；静态容器不要加，避免 Tab 序列噪音。
- 弹层保持 `role="dialog"` + `aria-modal="true"`，焦点圈定与 Esc 关闭逻辑不变。
- 焦点环使用 `outline` + 负 `outline-offset`，不参与布局，不触发重排。
- 尊重 `prefers-reduced-motion`：滚动容器本身不加动画；现有弹层动画只动 `opacity`/`transform`。

## 7. 验收清单

- [ ] `grep -rn "overflow-y-auto\|overflow-auto\|overflow-y-scroll" src` 无结果（滚动统一走 `.scroll-area*`）。
- [ ] 新滚动区域具备 `min-width/min-height: 0`、`overscroll-behavior`、`scrollbar-gutter: stable`。
- [ ] WebKit 与 Firefox 滚动条颜色/宽度一致，深浅主题均可见。
- [ ] 键盘 Tab 可进入滚动区域，focus ring 可见且不被裁剪。
- [ ] 多弹层嵌套打开/关闭后 body `overflow` 与 `padding-right` 完全恢复。
- [ ] `npm test`、`npm run lint`、`npx tsc --noEmit`、`npm run build` 全绿。
