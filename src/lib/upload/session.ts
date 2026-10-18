import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { UPLOAD_SESSION_TTL_MS } from "@/lib/upload/constants";
import { createChunkPlan } from "@/lib/upload/plan";
import type { UploadServiceId, UploadSessionPayload } from "@/lib/upload/types";
import { storageForService } from "@/lib/upload/types";

export class UploadSessionError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "UploadSessionError";
    this.code = code;
    this.status = status;
  }
}

type CreateUploadSessionInput = {
  roomId: string;
  userId: string;
  service: UploadServiceId;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  now?: number;
};

function encodeBase64Url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function decodeBase64Url(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

export function createUploadSession(
  input: CreateUploadSessionInput,
): UploadSessionPayload {
  const now = input.now ?? Date.now();
  const plan = createChunkPlan(input.sizeBytes);

  return {
    v: 1,
    sid: randomBytes(16).toString("hex"),
    roomId: input.roomId,
    userId: input.userId,
    service: input.service,
    storage: storageForService(input.service),
    fileName: input.fileName,
    mimeType: input.mimeType,
    totalBytes: input.sizeBytes,
    chunkSize: plan.chunkSize,
    totalChunks: plan.totalChunks,
    issuedAt: now,
    expiresAt: now + UPLOAD_SESSION_TTL_MS,
  };
}

export function signUploadSession(
  payload: UploadSessionPayload,
  secret: string,
): string {
  if (!secret) {
    throw new UploadSessionError(
      "UPLOAD_SESSION_SECRET_MISSING",
      "上传会话密钥未配置",
      503,
    );
  }

  const body = encodeBase64Url(JSON.stringify(payload));
  const signature = createHmac("sha256", secret).update(body).digest();
  return `${body}.${encodeBase64Url(signature)}`;
}

function assertPayloadShape(
  payload: unknown,
  now: number,
): asserts payload is UploadSessionPayload {
  if (!payload || typeof payload !== "object") {
    throw new UploadSessionError("UPLOAD_SESSION_INVALID", "上传会话无效");
  }

  const value = payload as Record<string, unknown>;

  if (value.v !== 1) {
    throw new UploadSessionError("UPLOAD_SESSION_VERSION", "上传会话版本不支持");
  }

  const stringFields = [
    "sid",
    "roomId",
    "userId",
    "fileName",
    "mimeType",
  ] as const;

  for (const field of stringFields) {
    if (typeof value[field] !== "string" || value[field].length === 0) {
      throw new UploadSessionError("UPLOAD_SESSION_INVALID", "上传会话字段缺失");
    }
  }

  if (value.service !== "sang" && value.service !== "pic-sl") {
    throw new UploadSessionError("UPLOAD_SESSION_INVALID", "上传服务无效");
  }

  if (value.storage !== "SANG" && value.storage !== "PIC_SL") {
    throw new UploadSessionError("UPLOAD_SESSION_INVALID", "上传存储标识无效");
  }

  if (value.storage !== storageForService(value.service)) {
    throw new UploadSessionError("UPLOAD_SESSION_INVALID", "上传存储标识不匹配");
  }

  const numberFields = [
    "totalBytes",
    "chunkSize",
    "totalChunks",
    "issuedAt",
    "expiresAt",
  ] as const;

  for (const field of numberFields) {
    if (
      typeof value[field] !== "number" ||
      !Number.isSafeInteger(value[field]) ||
      value[field] <= 0
    ) {
      throw new UploadSessionError("UPLOAD_SESSION_INVALID", "上传会话数值无效");
    }
  }

  const totalBytes = value.totalBytes as number;
  const chunkSize = value.chunkSize as number;
  const totalChunks = value.totalChunks as number;
  const issuedAt = value.issuedAt as number;
  const expiresAt = value.expiresAt as number;

  if (expiresAt <= now) {
    throw new UploadSessionError("UPLOAD_SESSION_EXPIRED", "上传会话已过期");
  }

  if (issuedAt > now + 60_000) {
    throw new UploadSessionError("UPLOAD_SESSION_INVALID", "上传会话时间无效");
  }

  const plan = createChunkPlan(totalBytes, chunkSize);
  if (plan.totalChunks !== totalChunks) {
    throw new UploadSessionError("UPLOAD_SESSION_INVALID", "上传会话分片信息不一致");
  }
}

export function verifyUploadSession(
  token: string,
  secret: string,
  now: number = Date.now(),
): UploadSessionPayload {
  if (!secret) {
    throw new UploadSessionError(
      "UPLOAD_SESSION_SECRET_MISSING",
      "上传会话密钥未配置",
      503,
    );
  }

  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new UploadSessionError("UPLOAD_SESSION_INVALID", "上传会话格式无效");
  }

  const [body, signature] = parts;
  const expected = createHmac("sha256", secret).update(body).digest();
  const received = decodeBase64Url(signature);

  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    throw new UploadSessionError("UPLOAD_SESSION_SIGNATURE", "上传会话签名无效");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(decodeBase64Url(body).toString("utf8"));
  } catch {
    throw new UploadSessionError("UPLOAD_SESSION_INVALID", "上传会话内容无效");
  }

  assertPayloadShape(payload, now);
  return payload;
}
