import { z } from "zod";

import { APP_VERSION } from "@/lib/constants";

const baseSchema = z.object({
  CHAT_ENCRYPTION_KEY: z
    .string()
    .min(32, "CHAT_ENCRYPTION_KEY 至少 32 字符")
    .optional(),
  S3_REGION: z.string().optional(),
  S3_ENDPOINT: z.string().url().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  DUFS_BASE_URL: z.string().url().optional(),
  DUFS_PUBLIC_BASE_URL: z.string().url().optional(),
  DUFS_PATH_PREFIX: z.string().optional(),
  DUFS_AUTH: z.string().optional(),
  OSS_PREVIEW_RPC_URL: z.string().url().optional(),
  OSS_PREVIEW_BUCKET_NAME: z.string().optional(),
  OSS_PREVIEW_COOKIE: z.string().optional(),
});

const parsed = baseSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(`环境变量解析失败: ${parsed.error.message}`);
}

const devFallbackKey = "0123456789abcdef0123456789abcdef";

export const env = {
  appVersion: APP_VERSION,
  encryptionKey:
    parsed.data.CHAT_ENCRYPTION_KEY ??
    (process.env.NODE_ENV === "production" ? undefined : devFallbackKey),
  s3: {
    region: parsed.data.S3_REGION ?? "",
    endpoint: parsed.data.S3_ENDPOINT,
    bucket: parsed.data.S3_BUCKET,
    accessKeyId: parsed.data.S3_ACCESS_KEY_ID,
    secretAccessKey: parsed.data.S3_SECRET_ACCESS_KEY,
    forcePathStyle: parsed.data.S3_FORCE_PATH_STYLE ?? true,
  },
  dufs: {
    baseUrl: parsed.data.DUFS_BASE_URL,
    publicBaseUrl: parsed.data.DUFS_PUBLIC_BASE_URL,
    pathPrefix: parsed.data.DUFS_PATH_PREFIX,
    auth: parsed.data.DUFS_AUTH,
  },
  ossPreview: {
    rpcUrl: parsed.data.OSS_PREVIEW_RPC_URL,
    bucketName: parsed.data.OSS_PREVIEW_BUCKET_NAME,
    cookie: parsed.data.OSS_PREVIEW_COOKIE,
  },
};

export function isS3Configured() {
  const s3 = env.s3;
  return Boolean(
    s3.endpoint && s3.bucket && s3.accessKeyId && s3.secretAccessKey,
  );
}

