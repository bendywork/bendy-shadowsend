# Maintain Notes

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
