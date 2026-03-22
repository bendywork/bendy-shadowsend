import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ApiError } from "@/lib/api";
import { env, isS3Configured } from "@/lib/env";

let s3ClientSingleton: S3Client | null = null;

function getS3Client() {
  if (s3ClientSingleton) {
    return s3ClientSingleton;
  }

  if (!isS3Configured()) {
    throw new ApiError(500, "S3 未配置完整，无法上传文件", "S3_NOT_CONFIGURED");
  }

  s3ClientSingleton = new S3Client({
    ...(env.s3.region ? { region: env.s3.region } : {}),
    endpoint: env.s3.endpoint,
    forcePathStyle: env.s3.forcePathStyle,
    credentials: {
      accessKeyId: env.s3.accessKeyId!,
      secretAccessKey: env.s3.secretAccessKey!,
    },
  });

  return s3ClientSingleton;
}

function getBucketName() {
  if (!env.s3.bucket) {
    throw new ApiError(500, "S3 Bucket 未配置", "S3_BUCKET_MISSING");
  }
  return env.s3.bucket;
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

