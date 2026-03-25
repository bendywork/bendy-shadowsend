# Maintain Notes

## Rule
- Every iteration (feature/fix/deploy change) must append an entry to this file.

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
