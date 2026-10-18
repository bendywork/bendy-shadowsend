# 房间页拆分设计（REQ-202610-0508 / ui-45）

## 目标

`src/app/room/[roomCode]/page.tsx` 原为 3000 行单文件，状态、请求、上传、公告、成员管理与全部 JSX 混在一起，任何 UI 改版都需要在巨型文件中穿梭。本次拆分的目标是：

- 页面只负责「编排」：组合数据 hooks、UI hooks 与展示组件。
- 按业务域组织代码，而不是按文件类型堆放。
- 零行为回归：DOM 结构、class 名、文案、轮询间隔、上传降级路径全部保持原样。
- 单文件回到可维护范围（页面 542 行，所有新增文件 < 500 行）。

## 分层

### 纯函数层 `src/lib/room-page.ts`

不依赖 React 与浏览器状态的逻辑集中于此：

- 附件预览：`isPreviewable` / `hasInlinePreview` / `guessPreviewType`
- 时间与消息：`formatRoomTime` / `mergeIncomingMessages` / `withStableAttachmentPreviewUrls`
- 长消息折叠：`isMessageCollapsed` / `getCollapsedPreviewText`
- 房间与浮层：`sortRooms` / `computeRoomMenuPosition`
- 已读状态：`getMessageDeliveryState`
- 轮询、广告轮播、上传限制等常量

### 请求与上传层

- `src/lib/room-upload.ts`：S3 直传、代理上传、分块代理上传、失败降级策略。保持原有 `console.error` 诊断信息与阈值。
- `src/lib/use-room-upload.ts`：把当前语言与房间号注入上传函数。

### 数据 hooks

| Hook | 职责 |
| --- | --- |
| `use-room-data.ts` | bootstrap + 快照加载、1.2s 消息轮询、25s 在线心跳、15s 快照同步、重试 |
| `use-room-messages.ts` | 草稿、附件、发送队列、上传进度、失败状态、复制反馈、长消息折叠 |
| `use-room-announcement.ts` | 公告编辑/预览/已读、图片对象 URL 生命周期 |
| `use-room-members.ts` | 移除成员、转让房主、审批加入请求 |
| `use-room-settings.ts` | 房间名、门禁码、加入策略、永不过期、解散 |
| `use-room-membership.ts` | 创建/加入/退出房间、邀请链接复制、房间入口表单 |
| `use-room-ui.ts` | 侧栏折叠持久化、菜单、设置弹层、成员 tab、图片查看器 |

### 展示组件

- `src/components/chat/`：`FileAction`、`MessageBubble`、`AdCarousel`、`RoomComposer`
- `src/components/room/`：`RoomSidebar`、`RoomLinks`、`MembersPanel`、`RoomSettingsPopover`、`RoomHeader`、`RoomMenu`、`RoomEntryDialog`、`RoomQrDialog`、`NoticeEditorDialog`、`NoticeViewerDialog`、`ImageViewerDialog`、`SwitchBtn`

组件只接收 props，不直接发请求；请求与状态留在 hooks，便于后续改版时替换视觉层。

## 数据流

```text
RoomPage
├─ useRoomData ────────────── boot / snap / loading / poll
├─ useRoomUpload ──────────── upload(file)
├─ useRoomMessages ────────── composer + pending messages
├─ useRoomAnnouncement ────── notice editor / viewer
├─ useRoomMembers ─────────── kick / transfer / review
├─ useRoomSettings ────────── room settings / dissolve
├─ useRoomMembership ──────── entry / leave / invite
└─ useRoomUi ──────────────── panels / menus / viewer
```

`RoomPage` 将 hook 返回值分发给展示组件，自身只保留页面级状态（`action`、`showNoticePopup`、二维码、面板 refs）与加载/审批分支。

## 零回归约束

- 原页面的硬编码中文文案保持不变（i18n 迁移不在本需求范围）。
- 轮询间隔、上传阈值、消息裁剪上限、菜单定位尺寸保持不变。
- 所有 DOM 层级与 Tailwind class 原样迁移；仅把内联 `clsx` 条件类改为等价的字符串拼接。
- 公告图片的 blob URL 在关闭编辑器、删除图片与卸载时释放，行为与原实现一致。

## 验收

- `npm test`：43/43（新增 16 条房间页纯函数测试 + 3 条上传降级策略测试）。
- `npm run lint`：0 errors。
- `npx tsc --noEmit`：通过。
- `npm run build`：通过。
- 手动冒烟：创建/加入房间、发送文本与附件、上传失败降级、公告编辑/预览/已读、成员审批/转让/移除、设置修改、解散与退出房间。
