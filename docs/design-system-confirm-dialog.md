# 危险操作确认对话框（ui-28 / REQ-202610-0491）

> 适用版本：v0.1.69
> 目标：用统一的自定义确认对话框替换全部 `window.confirm`（踢人 / 转让 / 退出 / 解散），危险语义、文案结构与交互行为保持一致。

## 1. 覆盖范围

| 操作 | 触发位置 | 动作键 | 危险级别 |
| --- | --- | --- | --- |
| 移出成员 | 成员菜单「移除房间」 | `kick-<memberId>` | 危险 |
| 转让房主 | 成员菜单「房主转让」 | `transfer-<memberId>` | 危险 |
| 退出房间 | 房间列表悬浮菜单「退出房间」 | `leave-<roomCode>` | 危险 |
| 解散房间 | Header 垃圾桶按钮 | `dissolve` | 危险 |

页面内不再出现 `window.confirm`；四个入口都只负责打开确认框，实际请求由确认框的「确认」动作触发。

## 2. 组件结构

实现：`src/components/ui/confirm-dialog.tsx`

```
ConfirmDialog（交互外壳）
├─ Portal → document.body
├─ 遮罩（点击关闭，提交中禁用）
├─ 焦点圈定 / 归还、Esc 关闭、body 滚动锁定
└─ ConfirmDialogContent（纯展示，可 SSR 测试）
   ├─ 危险标记图标 + eyebrow（危险操作）
   ├─ 标题（问句）
   ├─ 描述（后果 + 不可逆说明）
   └─ 操作区：取消（次按钮） / 危险确认（danger）
```

- `ConfirmDialogContent` 不依赖 DOM，可直接 `renderToStaticMarkup` 测试。
- 文案与动作键集中在 `src/lib/confirm-dialog.ts`，页面只提供操作对象。
- 提交中通过页面 `action` 状态推导，确认框展示 `pendingLabel` 并禁用所有关闭路径。

## 3. 文案规范

每条危险确认固定四段，避免各写各的：

1. **eyebrow**：统一「危险操作」/ `Danger`。
2. **标题**：简短问句，以「？」结尾，如「移除成员？」。
3. **描述**：说明对象与后果，并点明不可逆性；对象名使用「」包裹。
4. **动作**：按钮使用动词短语（移出房间 / 转让房主 / 退出房间 / 解散房间），不使用笼统的「确定」。

| 操作 | 标题 | 描述 |
| --- | --- | --- |
| 移出成员 | 移除成员？ | 将「{name}」移出房间后，对方将立即失去访问权限。 |
| 转让房主 | 转让房主？ | 将房主身份转让给「{name}」后，你将变为普通成员，且无法撤销。 |
| 退出房间 | 退出房间？ | 退出「{name}」后，你将无法继续查看房间内容。 |
| 解散房间 | 解散房间？ | 解散后所有成员将立即退出，房间内容无法恢复。 |

中英文键位于 `src/lib/i18n/messages.ts` 的 `confirm.*`，编译期 parity 校验保证两侧齐全。

## 4. 交互契约

- 打开时默认焦点落在「取消」上，降低误触风险。
- `Esc`、遮罩点击、取消按钮均可关闭；提交中全部禁用。
- `Tab` / `Shift+Tab` 在对话框内循环，关闭后焦点归还触发元素。
- 确认后按钮显示 spinner + 进行时文案（正在移出… / 正在转让… / 正在退出… / 正在解散…），并设置 `aria-busy`。
- 请求成功关闭对话框；失败保留对话框并走统一 `toastError`，用户可重试或取消。
- 页面用 `confirmInFlightRef` 防重复提交，避免双击触发两次请求。

## 5. 视觉与令牌

- 面板：`--ds-surface-panel` + `--ds-line` + `--ds-shadow-lg`，顶部细线使用 `--ds-danger-border`。
- 危险标记：`--ds-danger-soft` 底、`--ds-danger` 图标、`--ds-danger-border` 描边。
- 按钮：取消为 `.btn-secondary`，确认为 `.btn-danger`；确认按钮保持语义红，不使用主题反色。
- 全部颜色、间距、圆角、阴影、动效走 `--ds-*` 令牌；无硬编码色值。
- 入场仅动画 `opacity` / `transform`；`prefers-reduced-motion` 下关闭动画与 spinner。
- ≤480px 时操作区纵向排列（取消在下、确认在上），按钮高度 44px。

## 6. 可访问性

- `role="alertdialog"` + `aria-modal="true"` + `aria-labelledby` / `aria-describedby`。
- 危险图标 `aria-hidden`，语义由标题与描述承载。
- 提交中 `aria-busy="true"`，两个按钮均 `disabled`。
- 焦点初始落在最安全的「取消」，关闭后恢复原焦点。

## 7. 测试

- `src/lib/confirm-dialog.test.ts`：9 条，覆盖四类文案、名称插值、英文契约、标题/动作唯一性与动作键映射。
- `src/components/ui/confirm-dialog.test.tsx`：4 条 SSR 渲染断言，覆盖 alertdialog 语义、按钮顺序、提交中禁用与默认 tone。
- `npm test`：5 个文件 37 条通过。
- `npx tsc --noEmit`、`npm run lint`、`npm run build` 均通过。

## 8. 验收清单

- [ ] 踢人、转让、退出、解散均不再出现浏览器原生 confirm。
- [ ] 四类确认框标题、描述、按钮文案符合上表，中英文均正确。
- [ ] 打开后焦点在「取消」，Tab 不逃逸，Esc / 遮罩可关闭。
- [ ] 确认后显示进行时文案，期间不能重复提交或关闭。
- [ ] 请求失败保留对话框并出现错误 Toast，可重试。
- [ ] 深浅主题下危险色与层级正常，390px 宽度无横向溢出。
- [ ] `prefers-reduced-motion` 下无入场动画与 spinner 旋转。
