import crypto from "node:crypto";
import { ApiError } from "@/lib/api";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

let keyPromise: Promise<Buffer> | undefined;

function legacyKey(source: string): Buffer {
  const key = /^[a-fA-F0-9]{64}$/.test(source)
    ? Buffer.from(source, "hex") : Buffer.from(source.slice(0, 32), "utf8");
  if (source.length < 32 || key.length !== 32) {
    throw new ApiError(503, "历史消息加密密钥格式无效", "ENCRYPTION_KEY_INVALID");
  }
  return key;
}

function decryptWithKey(payload: string, key: Buffer) {
  const [iv, tag, encrypted] = payload.split(".");
  if (!iv || !tag || !encrypted) throw new Error("Invalid encrypted message");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64")), decipher.final()]).toString("utf8");
}

async function loadMessageKey() {
  const row = await prisma.appAuthConfig.upsert({
    where: { id: "default" }, create: { id: "default", auth: env.appAuth }, update: {},
    select: { encryptionKey: true },
  });
  if (row.encryptionKey) {
    if (!/^[a-f0-9]{64}$/.test(row.encryptionKey)) throw new ApiError(503, "数据库消息密钥无效", "ENCRYPTION_KEY_INVALID");
    return Buffer.from(row.encryptionKey, "hex");
  }
  const previousMessage = await prisma.message.findFirst({
    where: { encryptedContent: { not: null } }, select: { encryptedContent: true }, orderBy: { createdAt: "asc" },
  });
  const source = process.env.CHAT_ENCRYPTION_KEY;
  let key: Buffer;
  if (source) key = legacyKey(source);
  else if (previousMessage?.encryptedContent) {
    if (process.env.NODE_ENV === "production") {
      throw new ApiError(503, "升级时需先保留原消息加密密钥，成功导入数据库后可移除该配置", "ENCRYPTION_KEY_MIGRATION_REQUIRED");
    }
    key = legacyKey("0123456789abcdef0123456789abcdef");
  } else key = crypto.randomBytes(32);
  if (previousMessage?.encryptedContent) {
    try { decryptWithKey(previousMessage.encryptedContent, key); }
    catch { throw new ApiError(503, "原消息密钥无法解密历史消息，请检查升级配置", "ENCRYPTION_KEY_MIGRATION_FAILED"); }
  }
  // Compare-and-set prevents separate instances from selecting different initial keys.
  await prisma.appAuthConfig.updateMany({
    where: { id: "default", encryptionKey: null }, data: { encryptionKey: key.toString("hex") },
  });
  const saved = await prisma.appAuthConfig.findUniqueOrThrow({
    where: { id: "default" }, select: { encryptionKey: true },
  });
  if (!saved.encryptionKey || !/^[a-f0-9]{64}$/.test(saved.encryptionKey)) {
    throw new ApiError(503, "消息密钥初始化失败", "ENCRYPTION_KEY_INVALID");
  }
  return Buffer.from(saved.encryptionKey, "hex");
}

export function getMessageEncryptionKey(): Promise<Buffer> {
  keyPromise ??= loadMessageKey().catch((error) => { keyPromise = undefined; throw error; });
  return keyPromise;
}

export async function encryptText(plainText: string) {
  if (!plainText) {
    return null;
  }

  const iv = crypto.randomBytes(12);
  const key = await getMessageEncryptionKey();
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(plainText, "utf8")),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
}

export async function decryptText(payload?: string | null) {
  if (!payload) {
    return "";
  }

  const key = await getMessageEncryptionKey();
  try {
    return decryptWithKey(payload, key);
  } catch {
    return "[解密失败]";
  }
}

