import { APP_VERSION } from "@/lib/constants";
import { getConfigEntry } from "@/lib/config-center";

/**
 * 业务配置统一入口。
 *
 * 每个配置项都是 getter：读取时先查笨迪配置中心的内存快照，未命中（未配置、
 * 值为空、值非法）时回退到 Vercel 环境变量。业务代码仍然通过 `env.xxx`
 * 同步访问，无需感知配置来源。
 *
 * 注意：`DATABASE_URL`、`NEXT_PUBLIC_*` 等构建期/自举配置仍由环境变量提供，
 * 不经过配置中心（详见 docs/config-center.md）。
 */

const devFallbackKey = "0123456789abcdef0123456789abcdef";

function isUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function readString(key: string): string | undefined {
  return getConfigEntry(key).value;
}

function readUrl(key: string): string | undefined {
  return getConfigEntry(key, undefined, { validate: isUrl }).value;
}

function readAppAuth(): string {
  const entry = getConfigEntry("APP_AUTH", "bendywork", {
    validate: (value) => {
      const trimmed = value.trim();
      return trimmed.length >= 1 && trimmed.length <= 32;
    },
  });
  return entry.value?.trim() ?? "bendywork";
}

function readEncryptionKey(): string | undefined {
  const fallback =
    process.env.NODE_ENV === "production" ? undefined : devFallbackKey;
  return getConfigEntry("CHAT_ENCRYPTION_KEY", fallback, {
    validate: (value) => value.length >= 32,
  }).value;
}

export const env = {
  appVersion: APP_VERSION,
  get appAuth() {
    return readAppAuth();
  },
  get encryptionKey() {
    return readEncryptionKey();
  },
  s3: {
    get region() {
      return readString("S3_REGION") ?? "";
    },
    get endpoint() {
      return readUrl("S3_ENDPOINT");
    },
    get bucket() {
      return readString("S3_BUCKET");
    },
    get accessKeyId() {
      return readString("S3_ACCESS_KEY_ID");
    },
    get secretAccessKey() {
      return readString("S3_SECRET_ACCESS_KEY");
    },
    get forcePathStyle() {
      return readString("S3_FORCE_PATH_STYLE") === "true";
    },
  },
  dufs: {
    get baseUrl() {
      return readUrl("DUFS_BASE_URL");
    },
    get publicBaseUrl() {
      return readUrl("DUFS_PUBLIC_BASE_URL");
    },
    get pathPrefix() {
      return readString("DUFS_PATH_PREFIX");
    },
    get auth() {
      return readString("DUFS_AUTH");
    },
  },
  ossPreview: {
    get rpcUrl() {
      return readUrl("OSS_PREVIEW_RPC_URL");
    },
    get bucketName() {
      return readString("OSS_PREVIEW_BUCKET_NAME");
    },
    get cookie() {
      return readString("OSS_PREVIEW_COOKIE");
    },
  },
};

export function isS3Configured() {
  const s3 = env.s3;
  return Boolean(
    s3.endpoint && s3.bucket && s3.accessKeyId && s3.secretAccessKey,
  );
}
