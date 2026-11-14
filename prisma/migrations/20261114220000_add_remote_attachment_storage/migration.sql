-- Keep existing enum values and rows intact; new uploads use REMOTE exclusively.
ALTER TYPE "bendy_shadowsend_attachment_storage" ADD VALUE IF NOT EXISTS 'REMOTE';
