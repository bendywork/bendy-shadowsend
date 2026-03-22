import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ApiError } from "@/lib/api";
import { env, isS3Configured } from "@/lib/env";

const s3ClientCache = new Map<string, S3Client>();

function isAwsS3Endpoint(endpoint?: string) {
  if (!endpoint) return false;
  try {
    const host = new URL(endpoint).hostname.toLowerCase();
    return (
      host === "s3.amazonaws.com" ||
      host.endsWith(".amazonaws.com") ||
      host.endsWith(".amazonaws.com.cn")
    );
  } catch {
    return false;
  }
}

function resolveForcePathStyle(configuredValue: boolean) {
  if (configuredValue) return true;

  // Custom S3-compatible endpoints usually do not support bucket subdomain hosts reliably.
  // For safety, non-AWS endpoints are normalized to path-style addressing.
  if (!isAwsS3Endpoint(env.s3.endpoint)) {
    return true;
  }

  return false;
}

function isHostNotFoundError(error: unknown) {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: unknown }).code
      : undefined;

  return (
    code === "ENOTFOUND" ||
    (error instanceof Error && error.message.includes("getaddrinfo ENOTFOUND"))
  );
}

function getS3Client(options?: { forcePathStyle?: boolean }) {
  const forcePathStyle = resolveForcePathStyle(
    options?.forcePathStyle ?? env.s3.forcePathStyle,
  );

  if (!isS3Configured()) {
    throw new ApiError(500, "S3 未配置完整，无法上传文件", "S3_NOT_CONFIGURED");
  }

  const cacheKey = `${env.s3.endpoint}|${forcePathStyle ? "path" : "virtual"}`;
  const cached = s3ClientCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const client = new S3Client({
    ...(env.s3.region ? { region: env.s3.region } : {}),
    endpoint: env.s3.endpoint,
    forcePathStyle,
    credentials: {
      accessKeyId: env.s3.accessKeyId!,
      secretAccessKey: env.s3.secretAccessKey!,
    },
  });

  s3ClientCache.set(cacheKey, client);

  return client;
}

function getBucketName() {
  if (!env.s3.bucket) {
    throw new ApiError(500, "S3 Bucket 未配置", "S3_BUCKET_MISSING");
  }
  return env.s3.bucket;
}

function getOssPreviewBucketName() {
  return env.ossPreview.bucketName || env.s3.bucket || "";
}

export async function createUploadUrl(params: {
  key: string;
  contentType: string;
  expiresInSeconds?: number;
}) {
  const command = new PutObjectCommand({
    Bucket: getBucketName(),
    Key: params.key,
    ContentType: params.contentType,
  });

  const url = await getSignedUrl(getS3Client(), command, {
    expiresIn: params.expiresInSeconds ?? 120,
  });

  return url;
}

export async function uploadObject(params: {
  key: string;
  contentType: string;
  body: Uint8Array;
}) {
  const primaryForcePathStyle = resolveForcePathStyle(env.s3.forcePathStyle);
  const createCommand = () =>
    new PutObjectCommand({
      Bucket: getBucketName(),
      Key: params.key,
      ContentType: params.contentType,
      Body: params.body,
    });

  try {
    await getS3Client({ forcePathStyle: primaryForcePathStyle }).send(
      createCommand(),
    );
  } catch (error) {
    if (!primaryForcePathStyle && isHostNotFoundError(error)) {
      await getS3Client({ forcePathStyle: true }).send(createCommand());
      return;
    }
    throw error;
  }
}

export async function createDownloadUrl(params: {
  key: string;
  filename: string;
  expiresInSeconds?: number;
}) {
  const command = new GetObjectCommand({
    Bucket: getBucketName(),
    Key: params.key,
    ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(
      params.filename,
    )}`,
  });

  const url = await getSignedUrl(getS3Client(), command, {
    expiresIn: params.expiresInSeconds ?? 90,
  });

  return url;
}

export async function createInlineReadUrl(params: {
  key: string;
  expiresInSeconds?: number;
}) {
  const command = new GetObjectCommand({
    Bucket: getBucketName(),
    Key: params.key,
  });

  const url = await getSignedUrl(getS3Client(), command, {
    expiresIn: params.expiresInSeconds ?? 120,
  });

  return url;
}

type OssPreviewRpcResponse = {
  result?: {
    code?: number;
    message?: string;
    data?: {
      url?: string;
      expires_in?: number;
      is_charged?: boolean;
    };
  };
};

export async function createAttachmentPreviewUrl(params: {
  key: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  cookieHeader?: string;
  expiresInSeconds?: number;
}) {
  const rpcUrl = env.ossPreview.rpcUrl;
  const bucketName = getOssPreviewBucketName();

  if (rpcUrl && bucketName) {
    try {
      const headers: HeadersInit = {
        Accept: "application/json, text/plain, */*",
        "Content-Type": "application/json",
      };

      const cookie = env.ossPreview.cookie || params.cookieHeader;
      if (cookie) {
        headers.Cookie = cookie;
      }

      const response = await fetch(rpcUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "call",
          params: {
            bucket_name: bucketName,
            file_key: params.key,
            file_size: params.sizeBytes,
            file_type: params.mimeType,
            file_name: params.fileName,
          },
          id: null,
        }),
        cache: "no-store",
      });

      if (response.ok) {
        const payload = (await response.json()) as OssPreviewRpcResponse;
        const code = payload.result?.code;
        const url = payload.result?.data?.url;
        if (code === 2000 && typeof url === "string" && url) {
          return url;
        }
      }
    } catch {
      // fallback to S3 inline signed URL below
    }
  }

  return createInlineReadUrl({
    key: params.key,
    expiresInSeconds: params.expiresInSeconds,
  });
}

