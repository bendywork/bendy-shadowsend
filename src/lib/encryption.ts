import crypto from "node:crypto";
import { env } from "@/lib/env";

function getKey() {
  if (!env.encryptionKey) {
    throw new Error("缺少 CHAT_ENCRYPTION_KEY，无法加密消息");
  }

  const source = env.encryptionKey;

  if (/^[a-fA-F0-9]{64}$/.test(source)) {
    return Buffer.from(source, "hex");
  }

  const normalized = source.length >= 32 ? source.slice(0, 32) : source.padEnd(32, "0");
  return Buffer.from(normalized, "utf8");
}

export function encryptText(plainText: string) {
  if (!plainText) {
    return null;
  }

  const iv = crypto.randomBytes(12);
  const key = getKey();
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(plainText, "utf8")),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
}

export function decryptText(payload?: string | null) {
  if (!payload) {
    return "";
  }

  const [ivRaw, tagRaw, encryptedRaw] = payload.split(".");
  if (!ivRaw || !tagRaw || !encryptedRaw) {
    return "[解密失败]";
  }

  try {
    const key = getKey();
    const iv = Buffer.from(ivRaw, "base64");
    const tag = Buffer.from(tagRaw, "base64");
    const encrypted = Buffer.from(encryptedRaw, "base64");

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    return "[解密失败]";
  }
}

