-- REQ-202610-0517: 附件存储模型适配（最小迁移）
-- 1) AttachmentStorage 新增 SANG / PIC_SL 远端存储取值。
--    使用 IF NOT EXISTS，兼容 up-01 / up-02 并行分支的枚举迁移先合并。
-- 2) 分片附件新增 chunkManifest（JSONB，可空）；不新增表、不删除列。
ALTER TYPE "bendy_shadowsend_attachment_storage" ADD VALUE IF NOT EXISTS 'SANG';
ALTER TYPE "bendy_shadowsend_attachment_storage" ADD VALUE IF NOT EXISTS 'PIC_SL';

ALTER TABLE "bendy_shadowsend_message_attachment"
  ADD COLUMN IF NOT EXISTS "chunkManifest" JSONB;
