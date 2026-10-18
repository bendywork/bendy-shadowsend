# 设置面板（主题 / 语言 / 偏好，REQ-202610-0503 / ui-40）

> 适用版本：v0.1.69
> 目标：把散落在头部的主题、语言切换与输入偏好收敛到同一个设置入口，减少顶栏控件数量，偏好统一持久化到本浏览器。

## 1. 入口与结构

- 顶栏右上角只保留一个「设置」图标按钮（`SlidersHorizontal`），点击打开设置面板。
- 面板复用共享 `Popover`：portal 到 body、遮罩点击 / Esc 关闭、打开时锁定滚动、Tab 焦点圈定、关闭后焦点归还触发按钮。
- 面板分三段：
  1. **外观**：浅色 / 深色分段选择，当前项 `aria-pressed=true`。
  2. **语言**：中文 / English 分段选择，切换后全站文案立即更新。
  3. **偏好**：回车发送开关；关闭后 Enter 换行，Ctrl/⌘+Enter 仍可发送。
- 面板底部提示「偏好仅保存在此浏览器」，明确持久化范围。

## 2. 状态与持久化

| 偏好 | localStorage 键 | 默认值 | 读取方 |
| --- | --- | --- | --- |
| 主题 | `tb:theme` | `dark` | `src/lib/theme.ts` 的 `useTheme` |
| 语言 | `tb:lang` | `zh` | `src/lib/i18n/context.tsx` |
| 回车发送 | `tb:enter-to-send` | `true` | `src/lib/preferences.ts` + `usePersistentBoolean` |

- 主题与语言继续使用 `useSyncExternalStore`：服务端快照与 SSR 默认值一致，挂载后切到本地真实值，避免水合闪烁。
- `usePersistentBoolean` 读取时区分「键不存在」与「显式关闭」：键不存在返回调用方默认值，显式 `"0"` 才返回 `false`。
- 设置面板与房间输入区共用同一偏好键与 `pref:tb:enter-to-send` 自定义事件，面板切换后输入区立即生效；跨标签页由 `storage` 事件同步。

## 3. 文件分层

| 文件 | 职责 |
| --- | --- |
| `src/components/settings/settings-panel.tsx` | `SettingsButton` 交互外壳 + `SettingsPanelContent` 纯展示层（可 SSR 测试） |
| `src/lib/theme.ts` | 主题类型、存储键、规范化、`useTheme` 与 `data-theme` 应用 |
| `src/lib/preferences.ts` | 偏好存储键与布尔值读取规则 |
| `src/lib/use-persistent-boolean.ts` | 布尔偏好持久化 hook，支持显式默认值 |
| `src/app/globals.css` | `.settings-*` 样式，全部使用 `--ds-*` 令牌 |

## 4. 视觉与交互

- 黑白灰语义令牌：分段控件沿用 `.segmented`，开关使用反色 `--ds-action-*`，无新增彩色强调色。
- 开关滑块仅动画 `transform` / `background-color`，分段项过渡使用动效令牌；`prefers-reduced-motion` 由全局安全网覆盖。
- 触控目标：分段项最小高度 36px，开关 42×24px，满足移动端可点按。
- 焦点：分段项与开关均有 `:focus-visible` 2px 焦点环；Popover 内 Tab 不逃逸。
- 面板宽度 `max-w-md`，窄屏下由 Popover 的 `w-full` + 页面内边距保证不横向溢出。

## 5. 验收清单

- [ ] 顶栏不再分别显示主题按钮与语言分段，只保留一个设置入口。
- [ ] 设置面板可切换浅色 / 深色，页面立即更新且刷新后保持。
- [ ] 设置面板可切换中文 / English，全站文案立即更新且刷新后保持。
- [ ] 关闭「回车发送」后 Enter 换行，Ctrl/⌘+Enter 仍发送；刷新后保持。
- [ ] 打开面板后 Tab 在面板内循环，Esc / 遮罩关闭并回到设置按钮。
- [ ] 深浅主题下分段、开关、提示文字对比度正常，390px 宽度无横向溢出。
- [ ] `npm test`、`npm run lint`、`npx tsc --noEmit`、`npm run build` 全部通过。
