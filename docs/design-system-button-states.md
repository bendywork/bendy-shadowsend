# 按钮加载 / 禁用态与防重复提交（v0.1.69 / ui-32）

> 需求：REQ-202610-0495「按钮加载/禁用态统一」  
> 关联：ui-03 按钮体系（`feat/req-202610-0466-button-system`）  
> 适用：首页、房间页、房间入口弹窗、成员审批、房间设置、公告编辑与附件下载。

## 1. 目标

提交类按钮统一使用同一套 loading / disabled 语义，并在事件入口同步拦截重复提交：

- loading 时自动 `disabled`，避免二次点击。
- loading 时显示统一 spinner，图标位由 spinner 替换，文案与静态态使用同一 i18n key，避免宽度跳动。
- 禁用态统一使用按钮体系的 `opacity` / `cursor`，不再逐个页面手写。
- 防重复不依赖 React state：`setState` 是异步的，双击的第二次事件可能早于 loading 渲染。

## 2. 组件 API

`src/components/ui/button.tsx`（与 ui-03 保持同一 API）：

```tsx
<Button
  type="submit"
  variant="primary"   // primary | secondary | ghost | danger
  size="md"           // sm | md
  loading={submitting}
  disabled={loading}
  icon={<DoorOpen className="h-4 w-4" />}
  block
>
  进入房间
</Button>
```

- `loading=true` 时：`disabled`、`aria-busy="true"`、`data-loading="true"`，子元素前的图标替换为 `.btn__spinner`。
- `IconButton` 增加同一套 `loading` / `size` 语义；loading 时用 spinner 替换 glyph。
- 所有按钮类名由组件统一输出：`.btn`、`.btn--{variant}`、`.btn--{size}`、`.btn--block`。

## 3. 防重复提交

`src/lib/async-guard.ts` 提供同步锁：

```ts
const guard = createAsyncGuard();
guard.tryLock("room-name"); // true
guard.tryLock("room-name"); // false
guard.unlock("room-name");
```

`src/lib/use-guarded-action.ts` 把它接入页面：

```ts
const { pendingKey: action, run: runAction } = useGuardedAction();

await runAction("room-name", async () => {
  // 异步请求；finally 由 hook 统一解锁
});
```

- 同一个 key 同时只执行一次；不同 key 互不影响（例如房间名与门禁码可分别保存）。
- `pendingKey` 直接驱动按钮 `loading={action === "room-name"}`。
- 动作结束后在 `finally` 中解锁，异常不会留下永久锁。
- 校验失败在加锁前返回，不会误占锁。

## 4. 覆盖范围

| 位置 | 动作 key | 组件 |
| --- | --- | --- |
| 首页加入 / 创建 | `home-submit` | `Button` primary md block |
| 房间入口创建 / 加入 | `room-entry` | `Button` secondary md block |
| 成员踢出 | `kick-{memberId}` | 菜单项 disabled（菜单点击后关闭） |
| 房主转让 | `transfer-{memberId}` | 菜单项 disabled（菜单点击后关闭） |
| 审批通过 / 拒绝 | `approve-{requestId}` / `reject-{requestId}` | `Button` secondary sm |
| 退出房间 | `leave-{roomCode}` | 菜单项 disabled（菜单点击后关闭） |
| 解散房间 | `dissolve` | `IconButton` loading |
| 房间名 / 门禁码保存 | `room-name` / `gate-code` | `Button` secondary sm |
| 加入策略 / 永不过期 | `join-policy` / `never-expire` | `SwitchBtn` disabled |
| 公告保存 | `notice` | `Button` secondary sm |
| 公告已读 | `notice-seen` | `Button` secondary sm |
| 附件下载 | `download` | `Button` secondary sm |
| 聊天发送 | `sendLockRef` | `Button` primary sm |

聊天发送保留「pending 气泡」作为进度反馈：提交时同步清空输入框与文件列表，`sendLockRef` 拦截同一事件循环内的重复提交；上传进度仍由消息气泡展示，避免大文件上传期间锁死输入框。

## 5. 样式与无障碍

- `globals.css` 新增 `--ds-control-sm` / `--ds-control-md` 与 `.btn` 体系；主按钮继续使用反色 `--ds-action-*`。
- `.btn__spinner` 仅使用 `transform: rotate()` 动画；`prefers-reduced-motion: reduce` 下减速到 1.6s，不新增位移动画。
- loading 按钮保留原文案，spinner 占用图标位，避免布局抖动。
- `aria-busy` / `data-loading` 同时提供给自动化和样式使用；`disabled` 保证键盘与屏幕阅读器一致。

## 6. 与 ui-03 的衔接

- 本分支的 `Button` / `IconButton` props 与 ui-03 一致；合并 ui-03 时以其 `.btn--*` 样式与 `docs/design-system-buttons.md` 为准。
- 本分支额外提供 `src/lib/async-guard.ts` / `use-guarded-action.ts`，ui-03 的页面改造可直接复用，不需要重复实现防重复逻辑。
- 若 ui-03 先合并，本分支只需保留 guard 与页面接入，按钮组件以 ui-03 版本为准。

## 7. 验收清单

- [x] 所有 `type="submit"` 按钮使用 `Button` 且带 loading / disabled。
- [x] 同一动作双击只发出一次请求。
- [x] 请求失败后按钮恢复可点击，错误走 `toastError`。
- [x] 不同动作可并行，不互相阻塞。
- [x] `npm test` 覆盖锁的占位 / 释放 / 多 key / 空 key 与按钮 SSR 状态。
- [x] `npm run lint`、`npx tsc --noEmit`、`npm run build` 通过。
