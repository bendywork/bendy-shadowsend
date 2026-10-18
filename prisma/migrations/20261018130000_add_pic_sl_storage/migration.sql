-- 非图片上传接入 pic.sl.al：新增附件存储枚举值。
-- 仅新增枚举取值，不改表结构、不迁移存量数据。
ALTER TYPE "bendy_shadowsend_attachment_storage" ADD VALUE IF NOT EXISTS 'PIC_SL';
