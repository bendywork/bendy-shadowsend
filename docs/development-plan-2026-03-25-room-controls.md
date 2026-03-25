# Development Plan: Room Controls Update

## Date
- 2026-03-25

## Requirements
1. Room name can be edited after room creation.
2. Add room setting: allow/deny join requests.
3. When join request policy is `deny`, users cannot join by room code/gate code.
4. Only when policy is `allow`, users can enter with gate code (or only room code if gate code is empty).

## Design
### 1) Data
- Add `allowJoinRequest` on `Room` with default `true`.
- Use migration to avoid breaking existing data.

### 2) Backend
- Add owner-only endpoint to update room name.
- Add owner-only endpoint to update join policy.
- Update room snapshot endpoint to expose `allowJoinRequest`.
- Enforce join policy in `/join` flow.

### 3) Frontend
- Add room name edit UI in owner settings.
- Add allow/deny toggle in owner settings.
- Keep existing gate code/never-expire settings unchanged.

### 4) Verification
- Run lint/build.
- Manually verify policy behavior for:
  - owner
  - active member
  - new user
  - kicked member

## Implementation Checklist
- [x] Prisma schema update
- [x] Prisma migration added
- [x] Validator updates
- [x] New API: room name update
- [x] New API: join policy update
- [x] Join route policy enforcement
- [x] Room snapshot response update
- [x] Room page settings UI update
- [x] Maintain documentation update
- [x] Lint + build validation
- [ ] Commit + push
