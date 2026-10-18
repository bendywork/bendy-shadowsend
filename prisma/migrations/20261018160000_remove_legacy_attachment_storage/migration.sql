-- REQ-202610-0752 / up-12: 旧存储彻底下线（存量清零后）
--
-- 前置条件：存量 S3 / DUFS 附件与公告图片已迁移或清理。
-- 若仍存在旧存储行，迁移会主动失败，避免在存量未清零时破坏读取能力。

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "bendy_shadowsend_message_attachment"
    WHERE "storage"::text IN ('S3', 'DUFS')
  ) THEN
    RAISE EXCEPTION 'legacy attachment rows remain (S3/DUFS); clear stock before up-12';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "bendy_shadowsend_room"
    WHERE "announcementImageStorage"::text IN ('S3', 'DUFS')
  ) THEN
    RAISE EXCEPTION 'legacy announcement images remain (S3/DUFS); clear stock before up-12';
  END IF;
END $$;

ALTER TABLE "bendy_shadowsend_message_attachment"
  ALTER COLUMN "storage" DROP DEFAULT;

ALTER TYPE "bendy_shadowsend_attachment_storage"
  RENAME TO "bendy_shadowsend_attachment_storage_legacy";

CREATE TYPE "bendy_shadowsend_attachment_storage" AS ENUM ('SANG', 'PIC_SL');

ALTER TABLE "bendy_shadowsend_message_attachment"
  ALTER COLUMN "storage" TYPE "bendy_shadowsend_attachment_storage"
  USING ("storage"::text::"bendy_shadowsend_attachment_storage");

ALTER TABLE "bendy_shadowsend_room"
  ALTER COLUMN "announcementImageStorage" TYPE "bendy_shadowsend_attachment_storage"
  USING ("announcementImageStorage"::text::"bendy_shadowsend_attachment_storage");

DROP TYPE "bendy_shadowsend_attachment_storage_legacy";
