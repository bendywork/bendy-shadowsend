# 公告阅读弹窗（ui-24 / REQ-202610-0487）

## 目标

- 阅读排版：把公告从「一段 14px 文本 + 图片堆叠」升级为编辑式阅读页——65ch 栏宽、15px/1.9 行高、首段放大、空行分段、长词/长链接安全换行。
- 已读交互：未读公告显示「新公告」徽标与「我知道了」主操作；关闭（按钮 / X / Esc / 遮罩）统一走同一条已读流程，成功后 Toast 反馈，失败保留弹窗并提示。
- 预览模式：房主在编辑器中预览草稿时使用同一弹窗，但显示「公告预览」、不出现未读徽标、关闭不触发已读接口。
- 视觉体系：黑白灰语义令牌、反色主按钮、分层表面、克制动效；移动端全屏阅读、44px 触控目标。

## 结构

```
src/components/chat/announcement-modal.tsx
├── AnnouncementModal           // Portal / 滚动锁定 / 焦点圈定与归还 / Esc / 遮罩
└── AnnouncementModalContent    // 纯展示，可服务端渲染测试
src/lib/announcement-reader.ts  // 分段、发布时间格式化
src/app/announcement-modal.css  // .announcement-modal* 样式
```

页面集成：`src/app/room/[roomCode]/page.tsx` 只保留状态与数据，原内联 `{showNoticePopup ? ...}` 整块删除，改为 `<AnnouncementModal />`。

## 交互状态机

| 状态 | 标题 | 徽标 | 主按钮 | 关闭行为 |
| --- | --- | --- | --- | --- |
| 未读公告 | 房间公告 | 新公告 | 我知道了（Check） | 调 `/announcement/seen`，成功后关闭 + Toast |
| 已读/普通查看 | 房间公告 | 无 | 关闭 | 直接关闭 |
| 草稿预览 | 公告预览 | 无 | 关闭预览 | 清空预览并关闭，不写已读 |
| 标记中 | 房间公告 | 新公告 | 正在标记已读…（spinner） | 按钮、X、Esc、遮罩全部禁用，防重复请求 |

- 标记失败：`toastError` 显示「公告已读状态更新失败」，弹窗保持打开，用户可重试。
- 图片点击仍复用房间页图片查看器；查看器打开时公告弹窗暂停焦点圈定与 Esc，避免两个浮层抢焦点。

## 排版与视觉

- 正文：`0.9375rem / 1.9`，`letter-spacing: 0.012em`，首段 `1rem`，`max-width: 65ch`，`text-wrap: pretty`。
- 空行分段；段内单换行通过 `white-space: pre-wrap` 保留；`overflow-wrap: anywhere` 防长链接横向溢出。
- 图片：1 张通栏、2–3 张双列；`object-fit: contain`，最大高度 44vh；悬停/聚焦显示放大图标。
- 颜色全部使用 `--ds-*` 语义令牌；主按钮复用 `.btn-primary`（反色）。
- 动效仅 `opacity` / `transform`；`prefers-reduced-motion` 下关闭入场、图片缩放与过渡。
- ≤480px：全屏面板、无圆角、底部按钮 44px 高并处理 safe-area。

## 可访问性

- `role="dialog"` + `aria-modal="true"` + `aria-labelledby` / `aria-describedby`。
- 打开后焦点落到主操作；Tab 在弹窗内循环，关闭后焦点归还触发按钮。
- 打开期间锁定 body 滚动；Esc 与遮罩关闭；按钮 `aria-busy`，标记中禁用。
- 图片按钮提供「查看第 N 张公告图片」的 `aria-label`，图片 `alt` 使用文件名或「公告图片 N」。

## 测试

- `src/lib/announcement-reader.test.ts`：分段（空行、CRLF、空文本）与时间格式化（合法/非法）。
- `src/components/chat/announcement-modal.test.ts`：未读、预览、时间与图片、标记中、已读关闭态 5 组服务端渲染断言。
- `npm test`、`npm run lint`、`npx tsc --noEmit`、`npm run build` 全部通过。

## 验收清单

- [ ] 新成员进入房间时公告自动弹出，显示「新公告」与「我知道了」。
- [ ] 点击主按钮 / X / Esc / 遮罩均标记已读且只请求一次；成功后 Toast「公告已标记为已读」。
- [ ] 接口失败时弹窗不关闭，出现错误 Toast，可重试。
- [ ] 房主预览草稿显示「公告预览」「关闭预览」，关闭不写已读。
- [ ] 长文本按空行分段、首段放大、长链接不横向溢出。
- [ ] 1/2/3 张图片布局正确，点击可打开图片查看器。
- [ ] 深色/浅色、1440 / 390 / 360 宽度无横向溢出；移动端全屏阅读。
- [ ] 键盘 Tab 焦点不逃逸、Esc 关闭、关闭后焦点回到公告按钮。
