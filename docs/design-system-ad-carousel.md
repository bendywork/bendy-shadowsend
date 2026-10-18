# 广告位（AdCarousel）降噪与布局整合（ui-41 / REQ-202610-0504）

> 适用版本：v0.1.69
> 目标：广告轮播从「独立描边卡片」收敛为房间头部的一行轻量信息，遵循黑白灰纪律，不再与页面主内容争夺注意力。

## 1. 现状问题

改版前的 `AdCarousel` 直接内联在房间页中：

- 独立成第三条 header 行，`rounded-lg border border-line bg-panel/70`，形成一块与周围层级无关的卡片。
- 广告条目支持任意 hex `color`，深色/浅色主题下都可能出现高饱和文字，破坏黑白灰纪律。
- 固定 `h-9`、`text-sm`，与 header 的标题/操作按钮争夺视觉权重。
- 下一张广告始终在 DOM 中，键盘可以 Tab 到视口外的链接。
- 没有暂停机制，自动轮播无法被用户主动停止。

## 2. 设计决策

### 2.1 布局整合

- 广告位从 header 底部独立行移入**标题行**：`房间名 / 房号` → 广告 ticker → 成员数 / 主题 / 语言。
- 桌面端使用 `sm:flex-1` 占据标题与右侧控件之间的剩余空间；移动端 `order-last basis-full` 换行到标题行末尾，仍是 header 的一部分。
- 去掉圆角、边框、背景和独立高度：只保留一行文字，视觉上属于 header 的信息层，而不是一张卡片。
- 无广告时组件返回 `null`，不保留任何占位高度（沿用 v0.1.52 行为）。

### 2.2 视觉降噪

| 项目 | 改版前 | 改版后 |
| --- | --- | --- |
| 容器 | `h-9` + 圆角 + 描边 + 半透明面板 | 无容器，仅一行 `h-5` 文本 |
| 文字 | `text-sm` + 广告自定义颜色 | `text-xs` + `--ds-ink-muted`，hover/focus 提升到 `--ds-ink` |
| 标识 | 无 | 10px 大写、`0.18em` 字距的 `推广 / Promoted` 标签 + 1px 分隔线 |
| 广告颜色 | 渲染 `item.color` | **忽略颜色字段**，统一继承主题；`color` 仅保留在数据协议中 |
| 链接 | 始终可见的下划线/颜色 | 默认无装饰，hover/focus 仅做文字色变化 |

`item.color` 与 `item.url` 的数据结构保持不变，后端与既有广告数据无需迁移；颜色字段保留是为了向后兼容，不再参与渲染。

### 2.3 动效与暂停

- 停留 `4200ms`，纵向滑动 `320ms`，只使用 `transform`；缓动 `--ds-ease-out`。
- `prefers-reduced-motion: reduce` 下 `motion-reduce:transition-none`，内容仍按节奏切换但不播放滑动动画。
- 鼠标悬停或键盘焦点进入广告区域时自动暂停；移出/失焦后恢复。
- 多条广告时显示 20px 的暂停/继续按钮，`aria-pressed` 表达状态，满足自动更新内容的暂停要求。

### 2.4 可访问性

- 根节点 `role="region"` + `aria-roledescription="carousel"` + `aria-label="推广信息"`，`aria-live="off"` 避免轮播内容反复打断读屏。
- 预渲染的下一张广告带 `aria-hidden="true"`，链接 `tabIndex={-1}`，不会进入键盘 Tab 顺序。
- 暂停按钮有本地化 `aria-label`，图标 `aria-hidden`。
- 外链保持 `target="_blank"` + `rel="noopener noreferrer"`。
- 广告文本单行 `truncate`，完整内容通过 `title` 提供。

## 3. 实现结构

| 文件 | 职责 |
| --- | --- |
| `src/lib/ad-carousel.ts` | 时长常量、索引夹取/循环、自动轮播判定、当前/下一张解析、条目清洗（纯函数） |
| `src/components/chat/ad-carousel.tsx` | `AdCarousel`（状态/计时器/暂停）与 `AdCarouselContent`（可 SSR 的纯展示层） |
| `src/app/room/[roomCode]/page.tsx` | 移除内联实现与 `HEX_COLOR_RE`，在 header 标题行接入共享组件 |
| `src/lib/i18n/messages.ts` | 新增 `ad.label` / `ad.region` / `ad.pause` / `ad.resume` 中英文案 |

### 3.1 组件 API

```tsx
<AdCarousel
  items={snap.adBoard.items}
  className="order-last basis-full sm:order-none sm:basis-48 sm:flex-1"
/>
```

- `items` 为空时渲染 `null`。
- `className` 只负责外部布局，不覆盖内部视觉。
- 纯展示层 `AdCarouselContent` 不依赖 hooks，可直接 `renderToStaticMarkup` 测试。

## 4. 测试与验证

- `src/lib/ad-carousel.test.ts`：8 条，覆盖时长关系、自动轮播判定、索引循环/负数夹取、单条不重复、空列表与不可变清洗。
- `src/components/chat/ad-carousel.test.tsx`：5 条 SSR 渲染，覆盖空态、单行结构、颜色忽略、外链安全属性、下一张 `aria-hidden`/`tabIndex=-1`、暂停按钮状态与单条隐藏。
- `vitest.config.ts` 纳入 `src/**/*.test.{ts,tsx}`。
- `npm test`、`npm run lint`、`npx tsc --noEmit`、`npm run build` 全部通过。

## 5. 验收清单

- [ ] 有广告时，广告位于 header 标题行内，不再出现独立描边卡片。
- [ ] 无广告时，header 不保留广告占位。
- [ ] 广告文字为黑白灰语义色，任何 `color` 字段都不会改变文字颜色。
- [ ] 桌面端广告位于标题与右侧控件之间；移动端在标题行末尾独占一行，不横向溢出。
- [ ] 悬停/聚焦暂停轮播，暂停按钮可手动暂停与恢复。
- [ ] `prefers-reduced-motion` 下无滑动动画。
- [ ] 键盘 Tab 不会进入视口外的下一张广告链接。
- [ ] 深浅主题下对比度与层级正常。
