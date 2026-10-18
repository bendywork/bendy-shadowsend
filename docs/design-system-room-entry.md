# 房间入口弹窗规范（加入 / 创建）

> 适用版本：v0.1.69（REQ-202610-0492 / ui-29）
> 目标：房间页的「加入 / 创建」入口与首页表单使用同一套控件、间距、校验和交互契约，不再维护手写弹窗。

## 1. 结构

```
RoomEntryDialog                 // 状态、校验、提交、关闭守卫
└─ Popover                      // portal、遮罩、焦点圈定、Esc/遮罩关闭
   └─ RoomEntryContent          // 可静态渲染的展示层
      ├─ SegmentedControl       // 加入 / 创建 分段切换（ui-15）
      ├─ JoinForm               // 房间号 + 门禁码 + 邀请 Token
      └─ CreateForm             // 房间名称 + 门禁码
         └─ Field + TextInput   // 标签、提示、计数器、行内错误（ui-15）
```

实现文件：

- `src/components/chat/room-entry-dialog.tsx`：弹窗壳与展示层。
- `src/components/ui/form-controls.tsx`：`Field` / `TextInput` / `SegmentedControl`，API 与 ui-15 分支一致。
- `src/lib/room-entry.ts`：纯函数校验、输入归一化、错误清理、提交文案选择。
- `src/lib/i18n/messages.ts`：`roomEntry.*` 中英文文案。

## 2. 与首页表单一致

| 元素 | 统一做法 |
| --- | --- |
| 分段切换 | `.segmented` + `.segmented-item`，激活态 `data-active="true"`；弹窗内 `fullWidth` |
| 输入框 | `.field px-4 py-2.5 text-sm`，与首页输入框完全一致 |
| 字段结构 | 标签 12px `--ds-ink-soft`；提示 11px `--ds-ink-muted`；错误 11px `--ds-danger` |
| 主按钮 | `.btn-primary` + `px-4 py-3 text-sm font-semibold`，全宽、图标 + 文案 |
| 计数器 | 门禁码 `0/6`；房间名称 `0/48`，超出上限时计数变危险色 |
| 提交文案 | 加入：`进入房间` / `正在进入…`；创建：`创建并进入` / `正在创建…` |

## 3. 交互契约

1. 打开弹窗时按入口按钮决定初始模式：侧栏「+」→ 创建；「加入」→ 加入。
2. 切换分段只清空错误，不丢失已输入内容。
3. 提交前校验当前模式：
   - 创建：房间名必填且 ≤ 48 字符；门禁码为空或恰好 6 位数字。
   - 加入：房间号必填且 4–64 字符；门禁码为空或恰好 6 位数字。
4. 校验失败时显示行内错误，并聚焦第一个错误字段；不弹 Toast。
5. 校验通过后按钮进入 loading，提交期间：
   - 两个分段项禁用；
   - 关闭按钮禁用；
   - Esc、遮罩点击不关闭弹窗。
6. 服务端失败走 `toastError`，弹窗保留输入，按钮恢复可点。
7. 创建成功 / 加入成功 / 加入申请已提交后关闭弹窗；成功加入会写入最近房间并跳转。
8. 房间数达到 `MAX_USER_ROOMS` 时，入口按钮禁用；弹窗内额外显示上限说明。

## 4. 可访问性

- `Popover` 提供 `role="dialog"`、`aria-modal="true"`、`aria-labelledby`，并新增 `aria-describedby` 指向房间数副标题。
- 打开时锁定 body 滚动，焦点移入面板，Tab 焦点圈定在弹窗内，关闭后归还焦点。
- 每个字段的提示与错误通过 `aria-describedby` 关联；错误节点 `role="alert"`，控件带 `aria-invalid="true"`。
- 分段控件使用 `role="tablist"` / `role="tab"` + `aria-selected`。
- 表单使用 `noValidate`，错误文案由应用渲染，避免浏览器原生提示与行内提示重复。
- 所有图标均为装饰性元素，按钮均有可见文案或 `aria-label`。

## 5. 测试与验收

- `src/lib/room-entry.test.ts`：输入归一化、创建/加入校验、错误清理不可变性、提交文案键、参数化文案上限。
- `src/components/chat/room-entry-dialog.test.tsx`：两种模式渲染、提示/计数器、错误关联、提交态禁用、分段激活态、房间上限说明。
- 回归检查：`npm test`、`npm run lint`、`npx tsc --noEmit`、`npm run build`。

验收清单：

- [ ] 房间页「+」与「加入」打开同一弹窗，初始模式正确。
- [ ] 分段切换、字段提示、计数器、错误文案与首页一致。
- [ ] 空房间名 / 超长房间名 / 非法门禁码 / 空房间号均显示行内错误并聚焦。
- [ ] 提交中无法关闭弹窗或切换模式。
- [ ] Esc、遮罩、关闭按钮均可关闭；关闭后焦点回到触发按钮。
- [ ] 浅色 / 深色主题下颜色、边框、焦点环均来自 `--ds-*` 令牌。
- [ ] 中文 / English 文案完整，无硬编码字符串。

## 6. 分支合并说明

本需求从 `master`（v0.1.68）开发。ui-15（REQ-202610-0478）尚未合入 `master`，因此本分支内置了与其 API 一致的 `Field` / `TextInput` / `SegmentedControl` 子集。合并 ui-15 时：

- 以 ui-15 的完整 `form-controls.tsx` 为准，保留本分支新增的可选 `counter` 属性；
- `globals.css` 只保留一份 `.form-field` / `.form-label` / `.form-required` / `.form-hint` / `.form-error` / `.form-counter` 定义；
- 若 ui-15 同时调整了 `.field` 的内边距，需要复核房间入口与首页输入框的 `px-4 py-2.5` 是否仍按预期生效。
