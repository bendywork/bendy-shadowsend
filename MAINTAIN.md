# Maintain Notes

## Rule
- Every iteration (feature/fix/deploy change) must append an entry to this file.

## 2026-10-18: v0.1.69 站点元信息与页脚整理（REQ-202610-0480 / ui-17）

### Scope
- 修正 `layout.tsx` 过时的英文站点元信息：标题从 `Temp Bendy` 改为本地化站点名，description 改为与当前产品一致的临时加密聊天室说明，并补齐 Open Graph / Twitter 摘要。
- 首页新增站点页脚：入口按「使用 / 项目」两组收敛，提供加入房间、创建房间、源码仓库、更新记录、开源协议与回到顶部入口；补充版本、年份与协议元信息。
- Bump app version to `0.1.69`.

### Changes
- `src/lib/site-meta.ts`（新）：集中维护站点标题、描述、关键词、仓库链接与页脚项目入口，输出 Next.js `Metadata`。
- `src/app/layout.tsx`：改用 `siteMetadata`，移除 `Temp Bendy` 与过时英文描述。
- `src/components/layout/site-footer.tsx`（新）：首页站点页脚组件；房间动作直接切换首页加入/创建表单并聚焦对应输入框，项目入口在新标签页打开真实仓库地址。
- `src/app/page.tsx`：页面骨架改为 `home-page` 纵向布局，内容区居中，底部挂载 `SiteFooter`；新增加入/创建输入框 ref 与页脚入口处理。
- `src/app/globals.css`：新增 `.home-page` / `.home-page__content` / `.site-footer*` 样式；页脚使用 surface/ink/line 语义令牌，链接下划线仅动 `transform`，并支持 `prefers-reduced-motion` 与 720px 单列布局。
- `src/lib/i18n/messages.ts`：新增 `site.footer.*` 中英文案（wordmark、tagline、分组、入口、版本、版权、回到顶部）。
- `src/lib/site-meta.test.ts`（新）：4 条单测覆盖本地化元信息、标题模板、页脚链接唯一性与中英文案完整性。

### Regression Checklist
- `npm test` green（含新增 site-meta 用例）。
- `npm run lint` green（0 errors）。
- `npx tsc --noEmit` green。
- `npm run build` green（Next.js 16.2.1）。

### Versioning / History
- Updated `package.json`, `package-lock.json` and `APP_VERSION` (constants) to `0.1.69`.
- Added this entry to `MAINTAIN.md` and README 更新记录.

## 2026-10-18: v0.1.68 全局反馈统一（Toast + 行内校验，REQ-202610-0475 / ui-12）

### Scope
- Route every action result through the global Toast system and every field-level validation error through inline errors below the control; remove the remaining ad-hoc error bars/text and raw `error.message` toasts.
- Unify error copy: network failures collapse to one localized message, 4xx business messages stay readable, 5xx/parse/generic failures use the caller's localized fallback.
- Bump app version to `0.1.68`.

### Changes
- `src/lib/client.ts`: added `ApiRequestError` with `status` and backend `code`; network/read failures use `NETWORK_ERROR`, parse failures `INVALID_RESPONSE`, non-OK responses carry `HTTP_<status>` or the backend code.
- `src/lib/feedback.ts` (new): `isNetworkError` / `resolveErrorMessage` / `toastError`; hides URLs, HTTP methods and parser details, preserves user-readable backend messages, and emits exactly one deduped error toast.
- `src/lib/form-validation.ts` (new): shared `validateRoomName` / `validateGateCode` / `validateRoomCode` returning i18n keys; constants for 48-char room names, 4–64-char room codes and 6-digit gate codes.
- `src/components/ui/field-error.tsx` (new): inline `role="alert"` error node paired with `aria-invalid` + `aria-describedby`.
- `src/app/page.tsx`: bootstrap/invite/create/join feedback moved to Toast; join and create forms use `noValidate` plus inline validation with error clearing on edit; removed the `error`/`info` bars.
- `src/app/room/[roomCode]/page.tsx`: initial load failure is a page-level error with a retry button; poll/sync/upload/send/member/approval/leave/announcement/dissolve/settings failures all go through `toastError` with localized fallbacks; room entry dialog and settings panel use the shared validators and inline errors; removed the remaining raw `error.message` toasts and the aside error line.
- `src/app/globals.css`: `input/textarea[aria-invalid="true"]` danger border and focus ring; `.field-error` uses `--ds-danger` at 12px/18px.
- `src/lib/i18n/messages.ts`: added zh/en keys for init/load/poll/sync/create/join/send/upload/member/transfer/approval/leave/notice/dissolve/settings/clipboard/invite failures, form validation, and `common.retry` (compile-time parity check enforced).
- `vitest.config.ts`: added the `@/*` alias so unit tests can import source modules by path.
- `docs/design-system-feedback.md` (new): feedback routing matrix, error layering, inline validation contract, coverage and acceptance checklist; `docs/design-system-notifications.md` links to it.

### Regression Checklist
- `npm test` green: 24/24 tests (toast store, feedback resolver, field validators).
- `npm run lint` green (0 errors).
- `npx tsc --noEmit` green.
- `npm run build` green (Next.js 16.2.1).

### Versioning / History
- Updated `package.json`, `package-lock.json` and `APP_VERSION` (constants) to `0.1.68`.
- Added this entry to `MAINTAIN.md` and README 更新记录.

## 2026-10-18: v0.1.67 发布 Tag 规范（REQ-202610-1374）

### Scope
- 将「每次发布推送必须发布对应 tag」固化为项目强制规范：正常版本 `<version>-ver`，修复版本 `<version>-fix-<次数>-ver`；本项目部署在 Vercel，所有 tag 以 `-ver` 结尾。
- 新增发布 tag 工具、测试与文档，版本升至 `0.1.67`。Docs/tooling-only iteration — no runtime behavior change.

### Changes
- 新增 `scripts/release-tag.mjs`：读取 `package.json` 版本，支持正常发布、`--fix [n]` 修复发布（自动取同版本下一个序号）、`--dry-run`、`--check`、`--branch`、`--remote`、`--no-push`；发布前校验分支、工作区、远端同步与 tag 重名。
- 新增 `scripts/release-tag.test.mjs`：覆盖正常/修复 tag 命名、非法版本与次数、自动修复序号、参数解析（`node --test`）。
- 新增 `docs/release-tagging.md`：强制规则、命名格式、操作流程、工具参数、验收清单。
- `AGENTS.md`：新增「发布 Tag（强制规范）」段落，要求每次发布推送同步发布 `-ver` tag。
- `README.md`：版本号管理新增「发布 Tag（强制）」流程与示例；更新记录新增 v0.1.67 条目。
- `package.json`：新增 `release:tag` 与 `test:release-tag` 脚本；版本升至 `0.1.67`。
- `src/lib/constants.ts`：通过 `scripts/sync-version.js` 同步为 `0.1.67`。

### Regression Checklist
- `node --test scripts/release-tag.test.mjs` 全绿。
- `node scripts/release-tag.mjs --dry-run --branch <发布分支>` 输出正确 tag 名称且不落盘。
- `npm run lint` + `npm run build` 通过（无运行时改动）。
- 发布后验证：`git tag --points-at HEAD` 含 `0.1.67-ver`；`git ls-remote --tags origin` 可见该 tag；Vercel 线上 `/api/bootstrap` 版本为 `0.1.67`。

### Versioning / History
- Updated `package.json` and `APP_VERSION` (constants) to `0.1.67`.
- Feature commit `73258ff`; added this entry to `MAINTAIN.md` and README 更新记录.

## 2026-10-18: v0.1.66 提示体系（Tooltip / Popover / Toast，REQ-202610-0469 / ui-06）

### Scope
- Unify transient feedback across the product: tooltip hover delay, popover interaction contract, and a new global toast system for copy / success / error / network feedback.
- Remove ad-hoc `hint` bars and `alert()` calls from the room page; every action result now goes through one toast contract.
- Bump app version to `0.1.66`.

### Changes
- `src/lib/toast-store.ts` (new): framework-free singleton store with `useSyncExternalStore` subscription, variant durations (`success` 2400ms / `info` 3000ms / `warning` 3600ms / `error` 4800ms), max 3 visible, and dedupe by `variant + message` with a revision bump to restart the timer.
- `src/components/ui/toast.tsx` (new): `ToastProvider` mounted in `src/app/layout.tsx`; variant icons, hover pause, close button, `role="alert"/"status"` with matching `aria-live`, `aria-atomic`.
- `src/components/ui/tooltip.tsx`: shared `TOOLTIP_DELAY_MS = 500` and `TOOLTIP_HIDE_DELAY_MS = 120`; keyboard focus shows immediately, `Escape` closes, `aria-describedby` injection and `role="tooltip"` retained.
- `src/components/ui/popover.tsx`: dialog semantics (`role="dialog"`, `aria-modal`, labelled by title), scroll lock with scrollbar compensation, focus move + Tab trap, focus restore on close, backdrop click / `Escape` close.
- `src/app/globals.css`: added `.toast-viewport` / `.toast-card` variant styles, `.popover-backdrop`, `popover-in` / `toast-in` keyframes (transform/opacity only), wider wrapping `.tooltip-bubble`; `prefers-reduced-motion` disables all three animations.
- `src/app/room/[roomCode]/page.tsx`: replaced `hint` state and `alert()` with `toast.success/info/warning/error` for copy link/message, download failure, kick/transfer/review, room limit, join request, leave room, announcement CRUD/images, room name, gate code, join policy and never-expire.
- `src/lib/i18n/messages.ts`: added 25 `toast.*` keys in zh + en (parity check enforced).
- `docs/design-system-notifications.md` (new): selection rules, timings, usage, accessibility and acceptance checklist.
- `vitest.config.ts` + `src/lib/toast-store.test.ts` (new): 8 unit tests covering defaults, dedupe, variant isolation, max visible, dismiss/clear, subscribe lifecycle, blank messages and explicit overrides.
- `package.json`: added `"test": "vitest run"` and `vitest@^3.2.7` dev dependency; version synced to `0.1.66` via `scripts/sync-version.js`.

### Regression Checklist
- `npm test` green: 8/8 tests.
- `npm run lint` green (0 errors).
- `npx tsc --noEmit` green.
- `npm run build` green (Next.js 16.2.1, 12 static pages).

### Versioning / History
- Updated `package.json`, `package-lock.json` and `APP_VERSION` (constants) to `0.1.66`.
- Added this entry to `MAINTAIN.md` and README 更新记录.

## 2026-10-17: v0.1.65 设计令牌体系重建（REQ-202610-0464 / ui-01）

### Scope
- Rebuild the design-token foundation for the UI revamp: a 10-step neutral gray primitive ramp, semantic surface/line/ink/action tokens, radius, spacing, elevation, motion duration/easing, and semantic status colors (success/warning/danger).
- Remove the 9 groups of light-theme `!important` overrides and the `--color-zinc-*` inversion hacks. Both themes now share one semantic contract and only swap the primitive ramp.
- Apply decision dc-02: monochrome accent only; primary buttons are inverted (dark = light surface + dark ink, light = dark surface + light ink).
- Bump app version to `0.1.65`.

### Changes
- `src/app/globals.css`:
  - Added `--ds-gray-0` … `--ds-gray-9` primitive ramp plus semantic tokens: `--ds-surface-*`, `--ds-line-*`, `--ds-ink-*`, `--ds-action-*`, `--ds-success/warning/danger-*`.
  - Added radius (`--ds-radius-*`), 4px-rhythm spacing (`--ds-space-*`), elevation (`--ds-shadow-*`), motion (`--ds-duration-*` / `--ds-ease-*`), overlay/media/QR/avatar tokens.
  - Mapped all tokens through `@theme inline` so utilities such as `bg-panel`, `text-ink-muted`, `border-line`, `shadow-md`, `duration-base` resolve to CSS variables.
  - Rebuilt component helpers (`.surface-card`, `.field`, `.btn-primary/secondary/ghost/danger`, `.segmented`, `.icon-btn`, `.menu-*`, `.notice-*`, `.chip`, `.tooltip-bubble`) to consume semantic tokens only.
  - Removed every `!important`; light theme no longer re-declares utilities or colors.
- `src/app/page.tsx`, `src/app/room/[roomCode]/page.tsx`, `src/components/chat/avatar.tsx`, `src/components/ui/popover.tsx`: migrated all legacy `zinc`/`black`/`white`/`red`/`amber`/`emerald` utilities to semantic tokens (210+ occurrences).
- `src/app/room/[roomCode]/page.tsx`: QR code colors now read `--ds-qr-dark` / `--ds-qr-light` from computed styles instead of hardcoded hex.
- `src/lib/ad-board.ts`: default ad text color is now empty (= inherit `--ds-ink-soft`) instead of a hardcoded gray; only valid hex overrides remain supported.
- `src/lib/identity.ts`: avatar color pool neutralized (`#6b7280`/`#4b5563` → `#6b6b73`/`#4b4b52`), no blue-gray values left.
- `package.json` / `src/lib/constants.ts`: version synced to `0.1.65` via `scripts/sync-version.js`.

### Regression Checklist
- `npm run lint` green.
- `npm run build` green (Next.js 16.2.1, 12 static pages).
- Playwright dual-theme check on `/`: `data-theme` switches correctly; primary button is `rgb(245,245,247)` on `rgb(8,8,10)` in dark and `rgb(17,17,19)` on white in light; surfaces/ink/borders all change with the ramp; no legacy blue accent (`rgb(10,132,255)` / `rgb(0,113,227)`) and no horizontal overflow at 1440px or 390px.
- Local API 500s during the check are due to no database in the verification environment; rendering and token assertions are unaffected.

### Versioning / History
- Updated `package.json` and `APP_VERSION` (constants) to `0.1.65`.
- Added this entry to `MAINTAIN.md` and README 更新记录.

## 2026-10-13: v0.1.64 决策回写（7 项决策结论同步路线图与需求卡，REQ-202610-0463）

### Scope
- Record the 7 decision outcomes (dc-01 ~ dc-07, released on the platform decision session by fntp) and sync the impact surface back to the roadmap doc and the BACS requirement cards.
- Bump app version to `0.1.64`. Docs-only iteration — no runtime behavior change.

### Changes
- `docs/development-plan-2026-10-13-roadmap.md`:
  - §1/§5: sequencing per dc-07 (upload first, UI second); all 7 decisions marked 已决 — dc-01=B (Vercel-native chunking only, no CF Worker), dc-02=A (monochrome + inverted primary buttons), dc-03=B (theme-batched 4–5 batches), dc-04=A (full multi-platform incl. mobile), dc-05=A (legacy config bypass, stock read-only), dc-06=A (bounded same-service retry 2-3x + explicit errors), dc-07=B (upload-first).
  - §3.2: UI list 46 → 49 items (ui-47 mobile gestures, ui-48 multi-platform real-device acceptance, ui-49 accent-color cleanup); §4.5: upload list 9 → 12 items (up-10 receiver merge + integrity, up-11 concurrent chunks + resume, up-12 legacy storage decommission); new ranges `REQ-202610-0747` ~ `REQ-202610-0752`.
  - §4.3/§4.4: architecture rewritten for the Vercel-native chunking path (≤4.5MB per request, ≈4MB chunks, receiver merge; no CF Worker).
- Platform write-back (BACS): 15 cards updated (decision pins), 7 decision cards closed (`completed`), 6 new cards inserted (`REQ-202610-0747` ~ `REQ-202610-0752`).
- `package.json` / `src/lib/constants.ts`: version synced to `0.1.64` via `scripts/sync-version.js`.

### Regression Checklist
- `npm run lint` + `npm run build` both green (no functional change).
- Live check after deploy: `GET /api/bootstrap` reports `0.1.64`.

### Versioning / History
- Updated `package.json` and `APP_VERSION` (constants) to `0.1.64`.
- Added this entry to `MAINTAIN.md` and README 更新记录 (commit `47fb770`).

## 2026-10-13: v0.1.63 发展路线规划（UI 全面改版 + 上传通道重构，REQ-202610-0463）

### Scope
- Produce the next-phase development roadmap: full UI revamp (macOS-minimal, 46 items) and upload-channel rebuild onto third-party services (9 items), with 7 decision cards (Jev-calibrated).
- Backfill 62 requirement cards into the BACS platform (`REQ-202610-0464` ~ `REQ-202610-0525`).
- Bump app version to `0.1.63`. Docs-only iteration — no runtime behavior change.

### Changes
- Added `docs/development-plan-2026-10-13-roadmap.md`:
  - Baseline & problem inventory (UI + upload pipeline), design principles, 46 UI items (ui-01 ~ ui-46, groups A–F), 9 upload items (up-01 ~ up-09), 7 decision cards (dc-01 ~ dc-07), and appendices with live-verified protocols for `file.sang.pub` / `pic.sl.al` plus platform limits (Vercel 4.5MB / CF Workers 100–200MB / CORS findings).
- `package.json` / `src/lib/constants.ts`: version synced to `0.1.63` via `scripts/sync-version.js`.

### Regression Checklist
- `npm run lint` + `npm run build` both green (no functional change).
- Live check after deploy: `GET /api/bootstrap` reports `0.1.63`.

### Versioning / History
- Updated `package.json` and `APP_VERSION` (constants) to `0.1.63`.
- Added this entry to `MAINTAIN.md` and README 更新记录 (commit `bd453b2`).

## 2026-09-24: v0.1.62 i18n 外壳收尾 + 预水合防闪烁（FOUC）

### Scope
- Route the remaining chat-shell strings through `t()` (footer stats card, mobile jump buttons, file download label).
- Add a pre-hydration inline script that syncs `<html data-theme>` and `<html lang>` from `localStorage` before first paint, eliminating the theme/language default-value flash.
- Bump app version to `0.1.62`.
- Phase 6 (final) of the chat-UI deep refactor plan (`docs/development-plan-2026-09-24-chat-ui-deep-refactor.md`).

### Frontend Changes
- `src/app/layout.tsx`:
  - Added a raw inline `<head>` script (`PREHYDRATION_INIT`) that reads `tb:theme` / `tb:lang` and sets `data-theme` (default `dark`) and `lang` (default `zh-CN`) on `<html>` synchronously, before hydration.
  - Added `suppressHydrationWarning` to `<html>` (the script mutates its attributes pre-hydration).
- `src/app/room/[roomCode]/page.tsx`:
  - Footer stats (`version` / `license` / `roomOnline` / `totalOnline` / `currentUser`) now use `t("footer.*")`.
  - Mobile jump buttons use `t("nav.rooms")` / `t("members.list")`.
  - `FileAction` gained a `label` prop; the download button label is passed as `t("chat.download")`.
- `src/lib/i18n/messages.ts`: added `footer.version/license/roomOnline/totalOnline/currentUser`, `nav.rooms`, `chat.download` (zh + en, parity-checked).

### Docs read (per AGENTS.md)
- Consulted `node_modules/next/dist/docs/01-app/03-api-reference/02-components/script.md`: `beforeInteractive` does not block hydration and targets external scripts, so a raw inline `<head>` script (not `next/script`) is the correct FOUC-prevention primitive.

### Regression Checklist
- Reload with a saved light theme: no dark flash before paint; toggle still persists and syncs across tabs.
- Reload with `tb:lang=en`: `<html lang>` is `en`; shell strings render in English (footer, mobile buttons, download).
- No React hydration warning on `<html>`.
- `npm run lint` + `npm run build` both green.

### Versioning / History
- Updated `package.json` and `APP_VERSION` (constants) to `0.1.62`.
- Added this entry to `MAINTAIN.md` and README 更新记录 (code commit `6501e6b`).

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
