# Maintain Notes

## Rule
- Every iteration (feature/fix/deploy change) must append an entry to this file.

## 2026-09-24: v0.1.61 底部输入区 composer 重设计 + 文案 i18n

### Scope
- Redesign the chat composer (file chips, textarea, action toolbar, send button) for a calmer macOS feel.
- i18n all composer strings.
- Bump app version to `0.1.61`.
- Phase 5 of the chat-UI deep refactor plan (`docs/development-plan-2026-09-24-chat-ui-deep-refactor.md`).

### Frontend Changes
- `src/app/room/[roomCode]/page.tsx`:
  - Composer container gains a `focus-within` highlight ring; file chips are softer (`rounded-xl`) and now show `formatBytes(size)` plus an aria-labelled remove button.
  - Toolbar buttons unified (icons + `transition`); the enter-to-send switch gains a `CornerDownLeft` icon and reads `Enter to send · On/Off`.
  - Character counter turns amber near the limit and red at the limit (`tabular-nums`).
  - Send button is disabled when there is no trimmed text and no files (mirrors the existing empty-content no-op in `send()`).
  - Imported `CornerDownLeft` from lucide.
- `src/lib/i18n/messages.ts`: added `composer.placeholder/attach/clipboard/enterToSend/send/removeFile` + `common.on/off` (zh + en, parity-checked).

### Regression Checklist
- Paste text/files, attach via the file picker, and read-clipboard all still work; chips remove individually.
- Enter-to-send toggle still gates Enter submission; Shift+Enter still newlines.
- Send is blocked (button disabled) only when both text and files are empty; otherwise sends as before.
- Composer strings flip between 中文/English; counter color states render.
- `npm run lint` + `npm run build` both green.

### Versioning / History
- Updated `package.json` and `APP_VERSION` (constants) to `0.1.61`.
- Added this entry to `MAINTAIN.md` and README 更新记录 (code commit `209b315`).

## 2026-09-24: v0.1.60 聊天消息气泡组件化 + 正文 i18n

### Scope
- Extract a shared module-level `MessageBubble` (+ `MessageAttachmentCard`) and use it for both committed and pending chat bubbles, removing ~250 lines of duplicated markup.
- Beautify bubbles (softer `rounded-2xl` + `shadow-sm`, `tabular-nums` timestamps, `·`-separated attachment meta).
- i18n the chat shell strings (empty state / copy / copied / expand / collapse / send-failed).
- Bump app version to `0.1.60`.
- Phase 4 of the chat-UI deep refactor plan (`docs/development-plan-2026-09-24-chat-ui-deep-refactor.md`).

### Frontend Changes
- `src/app/room/[roomCode]/page.tsx`:
  - New module-level `type BubbleAttachment` + `MessageAttachmentCard` (inline image/video preview with double-click zoom, file name + `mimeType · size`, optional trailing action node).
  - New module-level dumb `MessageBubble` (props: `own`, avatar/nickname/`createdAt`, `metaSlot`, `content`/`collapsed`/`visibleContent`, copy/expand handlers + `labels`, `attachments` + `renderAttachmentAction`, `onOpenImage`, `footerSlot`).
  - Committed `snap.messages.map` renders `<MessageBubble>` with Check/CheckCheck receipts as `metaSlot` and a `FileAction` download as `renderAttachmentAction`.
  - Pending `pendingMessages.map` renders `<MessageBubble own>` with sending(%)/failed status as `metaSlot`, no attachment action, and the failed error line as `footerSlot`.
  - Added `type ReactNode` to the react import.
- `src/lib/i18n/messages.ts`: added `chat.empty/copy/copied/expand/collapse/sendFailed` (zh + en, parity-checked).

### Regression Checklist
- Own / other-user / sent bubbles render as before (avatar, nickname, timestamp, receipts).
- Long messages still collapse/expand; copy still copies raw content with the ✅ feedback.
- Image double-click still opens the viewer; video plays inline; non-previewable files still show the download button (committed only).
- Pending bubbles show sending % / failed X + error footer; language switch flips the new chat strings.
- `npm run lint` + `npm run build` both green.

### Versioning / History
- Updated `package.json` and `APP_VERSION` (constants) to `0.1.60`.
- Added this entry to `MAINTAIN.md` and README 更新记录 (code commit `fa8f6ea`).

## 2026-09-24: v0.1.59 左侧导航栏可折叠 + 分级折叠菜单

### Scope
- Left room-navigation sidebar is now collapsible (persisted in `localStorage` `tb:nav-collapsed`).
- Replace the 管理/加入 tab toggle with a partitioned, collapsible hierarchical menu (two groups shown at once: 管理的房间 / 加入的房间).
- i18n the navigation shell strings (title / subtitle / group titles / count / empty / collapse controls).
- Bump app version to `0.1.59`.
- Phase 3 of the chat-UI deep refactor plan (`docs/development-plan-2026-09-24-chat-ui-deep-refactor.md`).

### Frontend Changes
- `src/app/room/[roomCode]/page.tsx`:
  - New persisted flags via `usePersistentBoolean`: `tb:nav-collapsed` (whole sidebar) + `tb:nav-group-created` / `tb:nav-group-joined` (per-group open state).
  - The `<main>` grid now derives its column template from both `navVisible` and `membersVisible` (four states: both / left-only / right-only / none) so a collapsed side leaves no empty track.
  - Left `<aside>` is always mounted and toggles `flex`/`hidden` by `navVisible` (mirrors the member panel; keeps refs/handlers stable).
  - Header gains a nav toggle `IconButton` (`PanelLeft`, active when open); the sidebar header gains a collapse button (`PanelLeftClose`); the mobile 房间列表 scroll button is gated on `navVisible`.
  - Removed `roomsPanelTab` state + its menu-reset effect + `activeRooms`; extracted the room context-menu positioning into a shared `handleToggleRoomMenu(room, button)` used by both groups.
  - Each group renders a header (chevron rotates on open + count badge) with its own create/join quick button, and a `RoomLinks` list when open.
- `RoomLinks`: added optional `emptyLabel` prop (defaults to 暂无) so each group can show a localized empty state.
- `src/lib/i18n/messages.ts`: added `control.nav.*` and `nav.*` keys (zh + en, parity-checked).

### Regression Checklist
- Toggle the left sidebar from the header button and from the in-panel collapse button; state persists across reload and syncs across tabs.
- Collapsing left and/or right sidebars yields a gap-free grid in every combination.
- Both room groups expand/collapse independently and persist; counts and empty states are correct.
- Create/Join quick buttons still respect the room-count limit; room context menu still opens/positions correctly.
- Navigation strings flip between 中文/English; `npm run lint` + `npm run build` both green.

### Versioning / History
- Updated `package.json` and `APP_VERSION` (constants) to `0.1.59`.
- Added this entry to `MAINTAIN.md` and README 更新记录 (code commit `a4c1c9d`).

## 2026-09-24: v0.1.58 右侧成员栏可折叠 + 房主设置弹层（Popover）+ 设置项 i18n

### Scope
- Right member sidebar is now collapsible for everyone; state persists in `localStorage` (`tb:members-collapsed`).
- Owner settings moved from an inline block in the right sidebar into a header-triggered `Popover` (portal to `body`).
- i18n the settings card labels (room name / gate code / join policy / expiry).
- Bump app version to `0.1.58`.
- Phase 2 of the chat-UI deep refactor plan (`docs/development-plan-2026-09-24-chat-ui-deep-refactor.md`).

### Frontend Changes
- `src/lib/use-persistent-boolean.ts` (new): `usePersistentBoolean(key, serverDefault)` — localStorage-backed boolean via `useSyncExternalStore` (same-tab custom event + cross-tab `storage`); no `setState`-in-effect.
- `src/components/ui/popover.tsx` (new): portal modal (to `body`), backdrop + centered `.popover-panel` card, Esc / backdrop-click to close — immune to ancestor `overflow` clipping.
- `src/app/room/[roomCode]/page.tsx`: `showManage` split into `membersCollapsed` (persisted, everyone) + `settingsOpen`; the member `<aside>` is always mounted and toggles `flex`/`hidden` by visibility (so the settings Popover mounts regardless of collapse); aside header gains a collapse button; owner tabs → `.segmented`; settings block wrapped in `<Popover>` with all labels routed through `t()`.
- `src/lib/i18n/messages.ts`: added Phase 2 shell keys (`settings.*`, `members.*`, `approvals.*`, `control.members.*`, `header.settings`, `common.close`).
- `src/app/globals.css`: added `.popover-panel`.

### Regression Checklist
- Collapse/expand the member sidebar; state persists across reload and syncs across tabs.
- When collapsed, the grid drops to 2 columns with no empty gap.
- Owner opens settings from the header button even while the member sidebar is collapsed (Popover still renders); Esc / backdrop closes it.
- All settings labels flip between 中文/English.
- `npm run lint` + `npm run build` both green.

### Versioning / History
- Updated `package.json` and `APP_VERSION` (constants) to `0.1.58`.
- Added this entry to `MAINTAIN.md` and README 更新记录 (code commit `863e5f6`).

## 2026-09-24: v0.1.57 聊天页顶部控件区（图标按钮 + 提示 + 主题/语言切换）

### Scope
- Chat room header: convert 邀请/二维码/公告/管理/解散 action buttons to icon-only with hover tooltips.
- Move theme toggle to the header top-right as a standalone icon button; add a 中/英 language switcher next to it.
- Introduce a lightweight client-side i18n framework (shell strings only).
- Remove the duplicate theme section from the right sidebar (theme now lives only in the header, so hiding the owner manage panel no longer hides the theme control).
- Bump app version to `0.1.57`.
- This is Phase 1 of the chat-UI deep refactor plan (`docs/development-plan-2026-09-24-chat-ui-deep-refactor.md`).

### i18n Framework (`src/lib/i18n/*`)
- `messages.ts`: zh/en message table (UI shell only — chat content & backend errors excluded), typed `Lang`/`MessageKey`, compile-time en/zh key-parity check.
- `context.tsx`: `LanguageProvider` + `useLanguage()`/`useT()`. Language preference stored in `localStorage` (`tb:lang`) and read via `useSyncExternalStore` (server snapshot = `DEFAULT_LANG` → matches `<html lang="zh-CN">`, avoids hydration mismatch; no `setState` inside effects). Missing-key fallback: lang → default → key; `{param}` interpolation.
- Mounted `<LanguageProvider>` around `{children}` in `src/app/layout.tsx`.

### Reusable UI (`src/components/ui/*`)
- `IconButton`: square icon-only button (`.icon-btn`), `active`/`danger` variants.
- `Tooltip`: hover-delay (~800ms) bubble, immediate on keyboard focus; `role="tooltip"`.
- `LanguageToggle`: `.segmented` 中/EN switcher bound to the i18n context.

### Frontend Changes
- `src/components/theme/theme-toggle.tsx`: rebuilt as an icon-only `IconButton` + `Tooltip`; theme read via `useSyncExternalStore` (`tb:theme`), server snapshot `dark`.
- `src/app/room/[roomCode]/page.tsx`: header member count via `t("header.members", …)`; top-right cluster `<ThemeToggle/>` + `<LanguageToggle/>`; action buttons → `<Tooltip><IconButton/></Tooltip>` with i18n labels; removed the `Btn` helper (now unused) and the right-sidebar 主题 section.
- `src/app/globals.css`: added `.icon-btn` (+ `--active`/`--danger`) and `.tooltip-bubble` (+ `--top`/`--bottom`/`--open`).

### Regression Checklist
- Header actions show icon-only; hovering ~1s reveals a tooltip; keyboard focus shows it immediately.
- Theme toggle in the header switches dark/light and persists across reloads (no hydration warning; no flash beyond the known pre-hydration FOUC deferred to a later phase).
- Language switcher flips shell strings (member count, action tooltips) between 中文/English and persists (`tb:lang`).
- Owner hiding the manage panel no longer loses the theme control (it lives in the header now).
- Non-owner sees invite/QR/announcement (view) actions; owner additionally sees manage + dissolve.

### Versioning / History
- Updated `package.json` and `APP_VERSION` (constants) to `0.1.57`.
- Added this entry to `MAINTAIN.md` and README 更新记录 (code commit `9ebc887`).

## 2026-09-24: v0.1.56 全局 UI 优化（macOS 质感）

### Scope
- Rework the global design system for a calmer, more refined macOS-like look.
- Redesign the login/landing page (reduce visual noise).
- Skin the chat send button as the accent primary action.
- Bump app version to `0.1.56`.

### Design System (`src/app/globals.css`)
- Refined dark/light token palettes; light theme rebuilt on Apple neutral grays + system blue accent.
- Added `-apple-system` / SF font stack and font smoothing (antialiased).
- Added unified radius/shadow/ring tokens and theme-aware helpers: `.surface-card`, `.field`, `.btn-primary`, `.segmented`.
- Softer body background gradients; thinner scrollbars; global `:focus-visible` ring.
- Light-mode zinc utilities now adapt via remapped `--color-zinc-*`; dropped redundant `border-zinc-800/900` `!important` fixes.

### Frontend Changes
- `src/app/page.tsx`: removed extra glow overlay; toned down heading/typewriter scale; card → `.surface-card`; tabs → `.segmented`; inputs → `.field`; submit → `.btn-primary`; distinct error styling.
- `src/app/room/[roomCode]/page.tsx`: send button → `.btn-primary` (accent), consistent with login.
- `docs/development-plan-2026-09-24-global-ui-optimize.md`: evaluation + phased optimization plan.

### Versioning / History
- Updated `package.json` and `APP_VERSION` (constants) to `0.1.56`.
- Added this iteration entry to `MAINTAIN.md` and README 更新记录.

## 2026-04-16: v0.1.55 Light Theme QR Visibility Fix

### Scope
- Fix room QR code visibility in light theme
- Rename the shared theme section title from settings to theme
- Bump app version to `0.1.55`

### Bug Fixes
- QR code generation now uses dark modules on a white background instead of white modules on a transparent background.
- QR image has an explicit white background and padding so light theme overlay/card colors cannot wash it out.

### Frontend Changes
- `src/app/room/[roomCode]/page.tsx`:
  - Reset QR image before regenerating it for the current room link.
  - Generate QR images with `dark: "#18181b"` and `light: "#ffffff"`.
  - Change the shared theme panel heading to `主题` and inner label to `外观模式`.
  - Add `bg-white p-2` to the QR image.

### Versioning / History
- Updated `package.json` and runtime version to `0.1.55`.
- Added this iteration entry to `MAINTAIN.md`.

## 2026-04-16: v0.1.54 成员列表滚动与主题设置修复

### Scope
- Fix member list scrolling for non-owner users
- Add scroll to owner settings panel
- Allow all members to change theme settings
- Bump app version to `0.1.54`

### Bug Fixes

#### 1. Non-owner Member List Height
- **Before**: Non-owner members had limited height on member list, causing layout issues
- **After**: Member list now takes full available height with `flex-1 overflow-y-auto` styling
- Members panel always shows scrollbar when needed regardless of user role

#### 2. Owner Settings Overflow
- **Before**: Settings panel had no scrollbar, options got pushed off-screen with many members
- **After**: Settings container now has `max-h-[24rem] overflow-y-auto` for proper scrolling
- All settings remain accessible even with many room members

#### 3. Theme Toggle Accessibility
- **Before**: Theme toggle was only visible to room owners
- **After**: Theme toggle moved to shared settings section, available to all members
- Every user can now customize their own viewing theme

### Frontend Changes
- `src/app/room/[roomCode]/page.tsx`:
  - Member list container: changed from conditional `max-h` to consistent `flex-1 overflow-y-auto`
  - Approvals list: changed from conditional `max-h` to `flex-1 overflow-y-auto`
  - Settings section: restructured to show theme toggle for all users
  - Owner-only settings wrapped in fragment, theme toggle moved outside owner check

### Versioning / History
- Updated `package.json` and runtime version to `0.1.54`
- Added this iteration entry to `MAINTAIN.md`

## 2026-03-28: Fix image upload failure around 12MB

### Symptom
- Uploading image files around `12MB` failed in the room page, even though business limits allowed much larger files.

### Root Cause
- The image path uses backend proxy upload (`/api/rooms/[roomCode]/upload` with `FormData`).
- Production logs show `413 FUNCTION_PAYLOAD_TOO_LARGE` on `/api/rooms/[roomCode]/upload`.
- This is a platform-level function request body limit (triggered before route code runs), so large image uploads fail when forced through backend proxy.

### Fix
- Upload strategy adjusted so all file types (including images) prefer S3 pre-signed direct upload first.
- `/api/rooms/[roomCode]/upload-url` now allows image MIME types when S3 is configured.
- Frontend no longer forces `image/*` to proxy path; only falls back to proxy when direct upload fails.
- Added explicit `413` error handling in proxy upload XHR for clearer user feedback.
- Kept `next.config.ts` `experimental.proxyClientMaxBodySize: "256mb"` for self-host/proxy deployments where Next proxy body buffering is in play.

### Notes
- Existing app-level file size checks remain unchanged.
- If S3 is unavailable, large files on serverless platforms may still be constrained by platform payload limits.

## 2026-03-25: v0.1.53 Dissolve Redirect Fix

### Scope
- Fix room dissolve navigation behavior when user has multiple active rooms.

### Bug Fix
- Before: dissolving current room always redirected to homepage.
- After: dissolving current room now redirects to the next available room in sorted room list.
- Fallback: if no active room remains, redirect to homepage.

### Frontend Changes
- Updated `dissolve()` logic in room page:
  - compute sorted rooms before dissolve
  - refresh bootstrap after dissolve
  - navigate to next room code if exists
  - otherwise clear last-room cache and go `/`

### Versioning / History
- Updated runtime/package version to `0.1.53`.
- Added this iteration entry to `MAINTAIN.md`.

## 2026-03-25: v0.1.52 Hide Empty Ad Bar

### Scope
- Hide room header ad carousel area when there are no active ad items.
- Bump app version to `0.1.52`.

### Frontend Changes
- `AdCarousel` now returns `null` when ad list is empty, so the header has no placeholder bar.

### Versioning / History
- Updated `package.json` and runtime version constants to `0.1.52`.
- Added this iteration entry to `MAINTAIN.md`.

## 2026-03-25: v0.1.51 System APIs + Ad Carousel + Style Alignment

### Scope
- Switch controls in room settings are unified to black/white/gray style.
- Room header adds a vertical ad text carousel area.
- New system-facing routes added: `/getInfo`, `/offline`, `/changeAuth`.
- New app auth persistence table and advertisement table.

### Data Layer
- Added tables:
  - `bendy_shadowsend_app_auth_config`
  - `bendy_shadowsend_advertisement`
- Migration:
  - `prisma/migrations/20260325113500_add_system_auth_and_advertisement/migration.sql`

### API Changes
- Added:
  - `GET/POST /getInfo`
  - `GET/POST /offline`
  - `GET/POST /changeAuth`
- Behavior:
  - `/getInfo` returns basic info without `auth`; returns privileged server stats/config with valid `auth`.
  - `/offline` requires `auth`; supports immediate or scheduled shutdown (`yyyy-MM-dd HH:mm:ss`).
  - `/changeAuth` updates auth from `old` to `new` (1~32 chars).
- Logging:
  - All three routes print operation records to server logs.

### Frontend Changes
- Room settings switches:
  - `allowJoinRequest`
  - `neverExpire`
- Both switches now use grayscale style.
- Room header ad board:
  - Vertical rolling display
  - Click-through URL support
  - Empty-state fallback text

### Config/Docs
- Added env support: `APP_AUTH` (default `bendywork`, 1~32 chars).
- README updated with:
  - max ad `content` length (`120`)
  - external API documentation
  - ad JSON format reference
  - 0.1.51 update log

## 2026-03-25: Room Rename + Join Policy

### Scope
- Room owners can rename a room after creation.
- Room settings now include `allowJoinRequest` (allow/deny).
- When `allowJoinRequest=false`, joining by room code + gate code is blocked.
- Existing invite-token join path remains available.

### Data Layer
- Prisma schema change:
  - `Room.allowJoinRequest Boolean @default(true)`
- Migration:
  - `prisma/migrations/20260325093000_add_room_allow_join_request/migration.sql`

### API Changes
- Added:
  - `POST /api/rooms/[roomCode]/name`
  - `POST /api/rooms/[roomCode]/join-policy`
- Updated:
  - `GET /api/rooms/[roomCode]` now returns `room.allowJoinRequest`
  - `POST /api/rooms/[roomCode]/join` enforces `allowJoinRequest` for code-based joins

### Frontend Changes
- Room settings panel:
  - Room name input + save button
  - Join policy toggle (`allowJoinRequest`)
- Room snapshot type updated:
  - `RoomSnapshot.room.allowJoinRequest`

### Regression Checklist
- Owner can rename room and name updates in room header/sidebar.
- Toggle `allowJoinRequest` to `deny`:
  - New users cannot join by room code (+ gate code when configured).
- Toggle back to `allow`:
  - Join by room code works again; gate code rule remains unchanged.
- Kicked users remain in approval flow.
- Existing room members are not affected by policy toggle.

### Operational Notes
- Apply migration before deploy:
  - `npm run prisma:migrate`
- Then regenerate client (already in build script):
  - `npm run prisma:generate`
