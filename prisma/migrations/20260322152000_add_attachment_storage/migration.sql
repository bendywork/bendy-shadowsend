DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'bendy_shadowsend_attachment_storage'
  ) THEN
    CREATE TYPE "bendy_shadowsend_attachment_storage" AS ENUM ('S3', 'DUFS');
  END IF;
END
$$;

ALTER TABLE "bendy_shadowsend_message_attachment"
  ADD COLUMN IF NOT EXISTS "storage" "bendy_shadowsend_attachment_storage" NOT NULL DEFAULT 'S3';

ALTER TABLE "bendy_shadowsend_room"
  ADD COLUMN IF NOT EXISTS "announcementImageStorage" "bendy_shadowsend_attachment_storage";
