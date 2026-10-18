-- 上传重构（up-05）：relay 上传结果使用 SANG / PIC_SL 存储标识。
-- 仅追加枚举值，不改表结构；与 up-01/up-02 的迁移使用 IF NOT EXISTS 保持幂等。
ALTER TYPE "bendy_shadowsend_attachment_storage" ADD VALUE IF NOT EXISTS 'SANG';
ALTER TYPE "bendy_shadowsend_attachment_storage" ADD VALUE IF NOT EXISTS 'PIC_SL';
