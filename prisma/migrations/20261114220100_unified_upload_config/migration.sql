-- Separate from ADD VALUE so PostgreSQL can safely use the committed enum value.
ALTER TABLE "bendy_shadowsend_message_attachment"
  ADD COLUMN IF NOT EXISTS "chunkManifest" JSONB;
ALTER TABLE "bendy_shadowsend_message_attachment"
  ALTER COLUMN "storage" SET DEFAULT 'REMOTE';
ALTER TABLE "bendy_shadowsend_app_auth_config"
  ADD COLUMN IF NOT EXISTS "encryptionKey" TEXT;
ALTER TABLE "bendy_shadowsend_message"
  ADD COLUMN IF NOT EXISTS "clientMessageId" TEXT;
CREATE UNIQUE INDEX "bendy_shadowsend_message_roomId_senderId_clientMessageId_key"
  ON "bendy_shadowsend_message" ("roomId", "senderId", "clientMessageId");
