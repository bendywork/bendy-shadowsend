import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureConfigLoaded, resetConfigCenterForTests } from "@/lib/config-center";
import { APP_VERSION } from "@/lib/constants";
import { env, isS3Configured } from "@/lib/env";

const ENV_KEYS = [
  "APP_AUTH",
  "CHAT_ENCRYPTION_KEY",
  "S3_REGION",
  "S3_ENDPOINT",
  "S3_BUCKET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "S3_FORCE_PATH_STYLE",
  "DUFS_BASE_URL",
  "DUFS_PUBLIC_BASE_URL",
  "DUFS_PATH_PREFIX",
  "DUFS_AUTH",
  "OSS_PREVIEW_RPC_URL",
  "OSS_PREVIEW_BUCKET_NAME",
  "OSS_PREVIEW_COOKIE",
  "CONFIG_CENTER_ENABLED",
  "CONFIG_CENTER_URL",
  "CONFIG_CENTER_APP_KEY",
  "CONFIG_CENTER_APP_SECRET",
  "CONFIG_CENTER_PROJECT",
  "CONFIG_CENTER_ENVIRONMENT",
  "CONFIG_CENTER_GROUP",
  "CONFIG_CENTER_TIMEOUT_MS",
  "CONFIG_CENTER_TTL_MS",
  "CONFIG_CENTER_RETRY_MS",
] as const;

const saved = new Map<string, string | undefined>();

function seedRemote(values: Record<string, string>) {
  const fetchImpl = vi.fn(async () =>
    new Response(
      JSON.stringify({
        success: true,
        data: {
          project: "bendy-shadowsend",
          environment: "test",
          group: "app-config",
          format: "json",
          content: JSON.stringify(values),
          version: 1,
          updated_at: "2026-10-19T00:00:00.000Z",
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    ),
  );

  return ensureConfigLoaded({
    url: "https://config.example.com",
    appKey: "ak_test",
    appSecret: "as_test",
    project: "bendy-shadowsend",
    environment: "test",
    group: "app-config",
    env: {},
    logger: { info: vi.fn(), warn: vi.fn() },
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
}

beforeEach(() => {
  resetConfigCenterForTests();
  for (const key of ENV_KEYS) {
    saved.set(key, process.env[key]);
    delete process.env[key];
  }
});

afterEach(() => {
  resetConfigCenterForTests();
  for (const key of ENV_KEYS) {
    const value = saved.get(key);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  saved.clear();
});

describe("env", () => {
  it("exposes the app version constant", () => {
    expect(env.appVersion).toBe(APP_VERSION);
  });

  it("defaults APP_AUTH when nothing is configured", () => {
    expect(env.appAuth).toBe("bendywork");
  });

  it("reads and trims APP_AUTH from the environment", () => {
    process.env.APP_AUTH = "  env-auth  ";
    expect(env.appAuth).toBe("env-auth");
  });

  it("prefers a non-empty config center value", async () => {
    await seedRemote({ APP_AUTH: "remote-auth" });
    process.env.APP_AUTH = "env-auth";
    expect(env.appAuth).toBe("remote-auth");
  });

  it("falls back to the environment when the remote value is empty", async () => {
    await seedRemote({ APP_AUTH: "" });
    process.env.APP_AUTH = "env-auth";
    expect(env.appAuth).toBe("env-auth");
  });

  it("ignores an over-long remote APP_AUTH", async () => {
    await seedRemote({ APP_AUTH: "x".repeat(33) });
    process.env.APP_AUTH = "env-auth";
    expect(env.appAuth).toBe("env-auth");
  });

  it("ignores an invalid remote URL and uses the environment", async () => {
    await seedRemote({ S3_ENDPOINT: "not a url" });
    process.env.S3_ENDPOINT = "https://s3.example.com";
    expect(env.s3.endpoint).toBe("https://s3.example.com");
  });

  it("uses remote values for URL fields", async () => {
    await seedRemote({
      DUFS_BASE_URL: "https://dufs.example.com",
      DUFS_PUBLIC_BASE_URL: "https://files.example.com",
      OSS_PREVIEW_RPC_URL: "https://rpc.example.com",
    });
    expect(env.dufs.baseUrl).toBe("https://dufs.example.com");
    expect(env.dufs.publicBaseUrl).toBe("https://files.example.com");
    expect(env.ossPreview.rpcUrl).toBe("https://rpc.example.com");
  });

  it("reads plain string fields from the config center", async () => {
    await seedRemote({
      S3_REGION: "auto",
      S3_BUCKET: "bucket",
      S3_ACCESS_KEY_ID: "access",
      S3_SECRET_ACCESS_KEY: "secret",
      DUFS_PATH_PREFIX: "/files",
      DUFS_AUTH: "user:pass",
      OSS_PREVIEW_BUCKET_NAME: "preview",
      OSS_PREVIEW_COOKIE: "cookie",
    });
    expect(env.s3.region).toBe("auto");
    expect(env.s3.bucket).toBe("bucket");
    expect(env.s3.accessKeyId).toBe("access");
    expect(env.s3.secretAccessKey).toBe("secret");
    expect(env.dufs.pathPrefix).toBe("/files");
    expect(env.dufs.auth).toBe("user:pass");
    expect(env.ossPreview.bucketName).toBe("preview");
    expect(env.ossPreview.cookie).toBe("cookie");
  });

  it("reads the encryption key from the config center", async () => {
    const key = "r".repeat(32);
    await seedRemote({ CHAT_ENCRYPTION_KEY: key });
    expect(env.encryptionKey).toBe(key);
  });

  it("rejects a short encryption key and keeps the dev fallback", async () => {
    await seedRemote({ CHAT_ENCRYPTION_KEY: "short" });
    expect(env.encryptionKey).toBe("0123456789abcdef0123456789abcdef");
  });

  it("keeps S3_FORCE_PATH_STYLE opt-in semantics", async () => {
    expect(env.s3.forcePathStyle).toBe(false);

    process.env.S3_FORCE_PATH_STYLE = "true";
    expect(env.s3.forcePathStyle).toBe(true);

    await seedRemote({ S3_FORCE_PATH_STYLE: "false" });
    expect(env.s3.forcePathStyle).toBe(false);
  });

  it("detects a complete S3 configuration", () => {
    process.env.S3_ENDPOINT = "https://s3.example.com";
    process.env.S3_BUCKET = "bucket";
    process.env.S3_ACCESS_KEY_ID = "id";
    process.env.S3_SECRET_ACCESS_KEY = "secret";
    expect(isS3Configured()).toBe(true);

    delete process.env.S3_SECRET_ACCESS_KEY;
    expect(isS3Configured()).toBe(false);
  });
});
