import { z } from "zod";

import { APP_VERSION } from "@/lib/constants";

const baseSchema = z.object({
  APP_AUTH: z.string().trim().min(1).max(32).optional(),
  CHAT_ENCRYPTION_KEY: z
    .string()
    .min(32, "CHAT_ENCRYPTION_KEY 至少 32 字符")
    .optional(),
  SANG_UPLOAD_URL: z.string().url().optional(),
  UPLOAD_ALLOWED_ORIGINS: z.string().optional(),
  UPLOAD_SESSION_SECRET: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim().length === 0 ? undefined : value,
    z.string().min(16).optional(),
  ),
});

const parsed = baseSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(`环境变量解析失败: ${parsed.error.message}`);
}

const devFallbackKey = "0123456789abcdef0123456789abcdef";

export const env = {
  appVersion: APP_VERSION,
  appAuth: parsed.data.APP_AUTH ?? "bendywork",
  encryptionKey:
    parsed.data.CHAT_ENCRYPTION_KEY ??
    (process.env.NODE_ENV === "production" ? undefined : devFallbackKey),
  sang: {
    uploadUrl:
      parsed.data.SANG_UPLOAD_URL ?? "https://file.sang.pub/api/upload",
  },
  upload: {
    allowedOrigins: parsed.data.UPLOAD_ALLOWED_ORIGINS,
    sessionSecret: parsed.data.UPLOAD_SESSION_SECRET,
  },
};

export function getUploadSessionSecret(): string | undefined {
  return env.upload.sessionSecret ?? env.encryptionKey;
}
