ALTER TABLE "bendy_shadowsend_room"
  ADD COLUMN IF NOT EXISTS "neverExpire" BOOLEAN NOT NULL DEFAULT false;
