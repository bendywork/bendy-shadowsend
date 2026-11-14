import { createCipheriv, randomBytes } from "node:crypto";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  key: null as string | null,
  previous: null as { encryptedContent: string } | null,
  upsert: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn(), findFirst: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: {
  appAuthConfig: { upsert: db.upsert, updateMany: db.updateMany, findUniqueOrThrow: db.findUniqueOrThrow },
  message: { findFirst: db.findFirst },
} }));

function legacyPayload(key: Buffer, text = "历史消息与新消息都能解密") {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return `${iv.toString("base64")}.${cipher.getAuthTag().toString("base64")}.${encrypted.toString("base64")}`;
}

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.stubEnv("CHAT_ENCRYPTION_KEY", "");
  db.key = null;
  db.previous = null;
  db.upsert.mockImplementation(async () => ({ encryptionKey: db.key }));
  db.updateMany.mockImplementation(async ({ data }) => {
    if (!db.key) db.key = data.encryptionKey;
    return { count: 1 };
  });
  db.findUniqueOrThrow.mockImplementation(async () => ({ encryptionKey: db.key }));
  db.findFirst.mockImplementation(async () => db.previous);
});
afterEach(() => vi.unstubAllEnvs());

describe("database-backed message encryption", () => {
  it("needs no configured key for an empty database and persists a random key", async () => {
    const { encryptText, decryptText } = await import("@/lib/encryption");
    const payload = await encryptText("只配置数据库");
    expect(db.key).toMatch(/^[a-f0-9]{64}$/);
    expect(payload).not.toContain("只配置数据库");
    expect(await decryptText(payload)).toBe("只配置数据库");
  });

  it("keeps the same key across a process restart without environment credentials", async () => {
    const first = await import("@/lib/encryption");
    const encrypted = await first.encryptText("restart");
    const savedKey = db.key;
    vi.resetModules();
    const second = await import("@/lib/encryption");
    expect(await second.decryptText(encrypted)).toBe("restart");
    expect(db.key).toBe(savedKey);
  });

  it("shares initialization across concurrent text operations", async () => {
    const { encryptText, decryptText } = await import("@/lib/encryption");
    const texts = Array.from({ length: 6 }, (_, index) => `message-${index}`);
    const encrypted = await Promise.all(texts.map(encryptText));
    expect(await Promise.all(encrypted.map(decryptText))).toEqual(texts);
    expect(db.upsert).toHaveBeenCalledTimes(1);
  });

  it.each(["hex", "text"])("imports the legacy %s key and preserves ciphertext compatibility", async (mode) => {
    const source = mode === "hex" ? "AB".repeat(32) : "0123456789abcdef0123456789abcdef-extra";
    const key = mode === "hex" ? Buffer.from(source, "hex") : Buffer.from(source.slice(0, 32));
    vi.stubEnv("CHAT_ENCRYPTION_KEY", source);
    db.previous = { encryptedContent: legacyPayload(key) };
    const { decryptText } = await import("@/lib/encryption");
    expect(await decryptText(db.previous.encryptedContent)).toBe("历史消息与新消息都能解密");
    expect(db.key).toBe(key.toString("hex"));
    vi.stubEnv("CHAT_ENCRYPTION_KEY", "");
    vi.resetModules();
    const restarted = await import("@/lib/encryption");
    expect(await restarted.decryptText(db.previous.encryptedContent)).toBe("历史消息与新消息都能解密");
  });

  it("uses the database key even if an obsolete environment key is changed", async () => {
    db.key = "cd".repeat(32);
    vi.stubEnv("CHAT_ENCRYPTION_KEY", "invalid old value");
    const { decryptText } = await import("@/lib/encryption");
    expect(await decryptText(legacyPayload(Buffer.from(db.key, "hex"), "persisted"))).toBe("persisted");
    expect(db.updateMany).not.toHaveBeenCalled();
  });

  it("refuses to replace a missing production legacy key", async () => {
    vi.stubEnv("NODE_ENV", "production");
    db.previous = { encryptedContent: legacyPayload(Buffer.alloc(32, 1)) };
    const { encryptText } = await import("@/lib/encryption");
    await expect(encryptText("new")).rejects.toMatchObject({ code: "ENCRYPTION_KEY_MIGRATION_REQUIRED" });
    expect(db.key).toBeNull();
  });

  it("refuses a wrong legacy key instead of overwriting history", async () => {
    vi.stubEnv("CHAT_ENCRYPTION_KEY", "01".repeat(32));
    db.previous = { encryptedContent: legacyPayload(Buffer.alloc(32, 2)) };
    const { getMessageEncryptionKey } = await import("@/lib/encryption");
    await expect(getMessageEncryptionKey()).rejects.toMatchObject({ code: "ENCRYPTION_KEY_MIGRATION_FAILED" });
    expect(db.key).toBeNull();
  });

  it("imports the old development fallback only for existing development messages", async () => {
    db.previous = { encryptedContent: legacyPayload(Buffer.from("0123456789abcdef0123456789abcdef")) };
    const { decryptText } = await import("@/lib/encryption");
    expect(await decryptText(db.previous.encryptedContent)).toBe("历史消息与新消息都能解密");
  });

  it("returns the key saved by a competing instance", async () => {
    db.updateMany.mockImplementation(async () => { db.key = "ef".repeat(32); return { count: 0 }; });
    const { getMessageEncryptionKey } = await import("@/lib/encryption");
    expect((await getMessageEncryptionKey()).toString("hex")).toBe("ef".repeat(32));
  });

  it("can recover after a transient initialization failure", async () => {
    db.upsert.mockRejectedValueOnce(new Error("temporary database outage"));
    const { getMessageEncryptionKey } = await import("@/lib/encryption");
    await expect(getMessageEncryptionKey()).rejects.toThrow("temporary database outage");
    expect((await getMessageEncryptionKey()).length).toBe(32);
  });

  it("does not initialize a key for empty text and rejects tampered ciphertext", async () => {
    const { encryptText, decryptText } = await import("@/lib/encryption");
    expect(await encryptText("")).toBeNull();
    expect(await decryptText(null)).toBe("");
    expect(db.upsert).not.toHaveBeenCalled();
    db.key = "ff".repeat(32);
    expect(await decryptText("broken.ciphertext.data")).toBe("[解密失败]");
  });
});
