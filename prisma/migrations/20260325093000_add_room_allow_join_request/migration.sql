ALTER TABLE "bendy_shadowsend_room"
  ADD COLUMN IF NOT EXISTS "allowJoinRequest" BOOLEAN NOT NULL DEFAULT true;
