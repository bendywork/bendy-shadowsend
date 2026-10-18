# 动效规范（ui-35 / REQ-202610-0498）

> 适用版本：v0.1.69
> 目标：全站动效时长与缓动收敛为单一令牌体系，并完整支持 `prefers-reduced-motion`。

## 1. 令牌体系

所有动效必须从 `src/app/globals.css` 的 `--ds-duration-*` / `--ds-ease-*` 取值，禁止在组件里写死毫秒数或 `cubic-bezier`。

| 令牌 | 值 | 典型用途 |
| --- | --- | --- |
| `--ds-duration-instant` | `0ms` | 即时切换、减动效兜底 |
| `--ds-duration-fast` | `120ms` | hover、按压、图标旋转等微交互 |
| `--ds-duration-base` | `180ms` | 默认状态过渡、弹层入场 |
| `--ds-duration-slow` | `280ms` | 主题切换、抽屉/面板等大面积过渡 |
| `--ds-duration-slower` | `420ms` | 大范围强调动画（谨慎使用） |
| `--ds-ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | 常规状态变化 |
| `--ds-ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | 入场 |
| `--ds-ease-in` | `cubic-bezier(0.4, 0, 1, 1)` | 退场 |
| `--ds-ease-linear` | `linear` | 进度条、循环动画 |

Tailwind 映射：`duration-instant` / `duration-fast` / `duration-base` / `duration-slow` / `duration-slower`，以及 `ease-standard` / `ease-out` / `ease-in` / `ease-linear`。共享工具类 `.transition-ui` 默认使用 `base + standard`。

## 2. 使用规则

- 只动画 `transform` / `opacity` / `clip-path` / `filter`；禁止动画 `width` / `height` / `top` / `left` / `margin`，避免触发布局。
- 所有 `transition` / `animation` 声明必须同时引用时长与缓动令牌；新增样式由 `src/lib/motion.test.ts` 的 CSS 契约测试兜底。
- 微交互（hover、press、图标状态）使用 `fast + standard`；默认状态变化与入场使用 `base + standard/out`；主题与大面积面板使用 `slow`；`slower` 仅用于确有必要的强调场景。
- JS 侧需要与 CSS 动画配合的计时器必须读取 `src/lib/motion.ts` 的 `MOTION_DURATIONS_MS`，不得另写数值。例如广告轮播的滑动等待使用 `MOTION_DURATIONS_MS.slow`，与 `--ds-duration-slow` 对齐。
- 程序化滚动统一调用 `getScrollBehavior()`，由它根据系统减动效偏好返回 `smooth` 或 `auto`。

## 3. prefers-reduced-motion

CSS 契约：

1. `:root` 下所有 `--ds-duration-*` 折叠为 `0ms`，令牌驱动的过渡与 Tailwind 时长工具类立即完成。
2. `*, *::before, *::after` 安全网：`animation-duration: 0.01ms !important`、`animation-iteration-count: 1 !important`、`transition-duration: 0.01ms !important`、`transition-delay: 0ms !important`，覆盖未走令牌的第三方或未来样式。
3. Toast / Popover 入场动画与 Tooltip 过渡直接关闭；`html` 的 `scroll-behavior` 回退为 `auto`。
4. `animate-spin` / `animate-pulse` 等无限动画只播放一轮，视觉上保持静态。

JS 契约：

- `prefersReducedMotion()` 读取 `(prefers-reduced-motion: reduce)`；`matchMedia` 缺失或抛错时返回 `false`，不影响主流程。
- `getScrollBehavior()` 在减动效时返回 `auto`，已接入消息自动滚动与移动端侧栏定位。
- 减动效模式只改变动画表现，不改变任何状态、数据与交互结果。

## 4. 测试与验证

- `src/lib/motion.test.ts`：16 条用例，覆盖时长刻度与顺序、CSS 令牌同步、Tailwind `--transition-duration-*` 映射、缓动令牌、全部 CSS 动效声明的令牌化、减动效媒体查询契约、`matchMedia` 缺失/抛错回退、滚动行为选择。
- `npm test`：4 个测试文件 40/40 通过。
- `npm run lint`：0 error；`npx tsc --noEmit`：0 error；`npm run build`：Next.js 16.2.1 生产构建通过。
- 无头 Chromium 冒烟（构建 CSS）：常规模式下 `.transition-ui` / `duration-base` 为 `180ms`、Toast/Popover 入场 `180ms`；模拟 `prefers-reduced-motion` 后过渡为 `0.01ms`、Toast/Popover 动画关闭、spinner 单次且瞬时。

## 5. 验收清单

- [ ] 全站 `transition` / `animation` 均引用 `--ds-duration-*` 与 `--ds-ease-*`，无硬编码毫秒或缓动。
- [ ] 系统开启「减少动态效果」后，弹层、Toast、Tooltip、按钮、开关均无动画。
- [ ] 消息自动滚动与侧栏定位在减动效下为瞬时跳转。
- [ ] 广告轮播在减动效下无滑动动画，内容仍按时切换。
- [ ] 深浅主题切换在减动效下瞬时完成。
- [ ] 键盘、鼠标与触屏交互在常规模式和减动效模式下行为一致。
