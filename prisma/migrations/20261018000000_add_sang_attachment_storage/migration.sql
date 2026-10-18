-- REQ-202610-0510: 图片上传接入 file.sang.pub
-- 新增 SANG 存储枚举值，用于记录通过 file.sang.pub 中转上传的图片。
ALTER TYPE "bendy_shadowsend_attachment_storage" ADD VALUE IF NOT EXISTS 'SANG';
