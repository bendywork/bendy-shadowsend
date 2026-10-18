import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { deflateRawSync, inflateRawSync } from "node:zlib";

import {
  PIC_SL_MAX_BYTES,
  SANG_MAX_BYTES,
  UPLOAD_CHUNK_SIZE_BYTES,
  UPLOAD_MAX_CHUNKS,
  UPLOAD_REMOTE_TIMEOUT_MS,
} from "@/lib/upload/constants";
import { manifestIntegrity, normalizeSha256 } from "@/lib/upload/hash";
import { createChunkPlan, sanitizeUploadFileName } from "@/lib/upload/plan";
import { isAllowedRemoteUrl } from "@/lib/upload/remote/urls";
import type { UploadManifest } from "@/lib/upload/types";
import { storageForService } from "@/lib/upload/types";

const MERGE_TOKEN_VERSION = "m1";
const MERGE_TOKEN_MAX_LENGTH = 16 * 1024;
const MERGE_TOKEN_MAX_INFLATED_BYTES = 64 * 1024;
const MERGE_MAX_REDIRECTS = 3;

export class MergeDownloadError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(code: string, message: string, status = 400, details?: unknown) {
    super(message);
    this.name = "MergeDownloadError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export type MergeTokenPayload = {
  v: 1;
  roomId: string;
  issuedAt: number;
  manifest: UploadManifest;
};

export type SignMergeTokenInput = {
  roomId: string;
  manifest: UploadManifest;
};

export type OpenMergedStreamOptions = {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
};

function encodeBase64Url(value: Buffer): string {
  return value.toString("base64url");
}

function signBody(body: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(`${MERGE_TOKEN_VERSION}.${body}`).digest();
}

function assertStringField(value: unknown, field: string, maxLength: number): void {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maxLength ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new MergeDownloadError("MERGE_MANIFEST_INVALID", `清单字段无效：${field}`);
  }
}

function assertManifestFields(value: unknown): asserts value is UploadManifest {
  if (!value || typeof value !== "object") {
    throw new MergeDownloadError("MERGE_MANIFEST_INVALID", "分片清单无效");
  }

  const manifest = value as Record<string, unknown>;
  assertStringField(manifest.uploadId, "uploadId", 128);
  assertStringField(manifest.fileName, "fileName", 255);
  assertStringField(manifest.mimeType, "mimeType", 255);

  if (manifest.service !== "sang" && manifest.service !== "pic-sl") {
    throw new MergeDownloadError("MERGE_MANIFEST_INVALID", "分片清单服务无效");
  }

  if (
    manifest.storage !== "SANG" &&
    manifest.storage !== "PIC_SL"
  ) {
    throw new MergeDownloadError("MERGE_MANIFEST_INVALID", "分片清单存储标识无效");
  }

  if (manifest.storage !== storageForService(manifest.service)) {
    throw new MergeDownloadError("MERGE_MANIFEST_INVALID", "分片清单存储标识不匹配");
  }

  const numbers = [
    "sizeBytes",
    "chunkSize",
    "totalChunks",
  ] as const;

  for (const field of numbers) {
    if (
      typeof manifest[field] !== "number" ||
      !Number.isSafeInteger(manifest[field]) ||
      (manifest[field] as number) <= 0
    ) {
      throw new MergeDownloadError("MERGE_MANIFEST_INVALID", "分片清单数值无效");
    }
  }

  if (manifest.chunkSize !== UPLOAD_CHUNK_SIZE_BYTES) {
    throw new MergeDownloadError("MERGE_MANIFEST_INVALID", "分片大小必须为 4MB");
  }
}

function assertChunkAt(
  manifest: UploadManifest,
  chunk: UploadManifest["chunks"][number],
  position: number,
  lastChunkBytes: number,
): void {
  if (!chunk || chunk.index !== position) {
    throw new MergeDownloadError("MERGE_MANIFEST_INVALID", "分片顺序无效");
  }

  const expected =
    position === manifest.totalChunks - 1
      ? lastChunkBytes
      : manifest.chunkSize;

  if (chunk.sizeBytes !== expected) {
    throw new MergeDownloadError("MERGE_MANIFEST_INVALID", "分片大小与清单不一致");
  }

  if (!isAllowedRemoteUrl(manifest.service, chunk.url)) {
    throw new MergeDownloadError("MERGE_MANIFEST_INVALID", "分片地址不受信任");
  }

  if (chunk.sha256 !== undefined && !normalizeSha256(chunk.sha256)) {
    throw new MergeDownloadError("MERGE_MANIFEST_INVALID", "分片 SHA-256 校验值无效");
  }
}

function assertManifestChunks(manifest: UploadManifest): void {
  if (manifest.fileName !== sanitizeUploadFileName(manifest.fileName)) {
    throw new MergeDownloadError("MERGE_MANIFEST_INVALID", "文件名无效");
  }

  const limit = manifest.service === "sang" ? SANG_MAX_BYTES : PIC_SL_MAX_BYTES;
  if (manifest.sizeBytes > limit) {
    throw new MergeDownloadError(
      "MERGE_MANIFEST_INVALID",
      `文件超过服务上限（${Math.floor(limit / 1024 / 1024)}MB）`,
    );
  }

  if (manifest.totalChunks > UPLOAD_MAX_CHUNKS) {
    throw new MergeDownloadError("MERGE_MANIFEST_INVALID", "分片数量超出上限");
  }

  let plan;
  try {
    plan = createChunkPlan(manifest.sizeBytes, manifest.chunkSize);
  } catch {
    throw new MergeDownloadError("MERGE_MANIFEST_INVALID", "分片数量与文件大小不一致");
  }

  if (plan.totalChunks !== manifest.totalChunks) {
    throw new MergeDownloadError("MERGE_MANIFEST_INVALID", "分片数量与文件大小不一致");
  }

  if (!Array.isArray(manifest.chunks) || manifest.chunks.length !== manifest.totalChunks) {
    throw new MergeDownloadError("MERGE_MANIFEST_INVALID", "分片数量不完整");
  }

  for (let position = 0; position < manifest.chunks.length; position += 1) {
    assertChunkAt(manifest, manifest.chunks[position], position, plan.lastChunkBytes);
  }

  const hashedChunks = manifest.chunks.filter((chunk) => chunk.sha256 !== undefined);
  if (hashedChunks.length > 0 && hashedChunks.length !== manifest.chunks.length) {
    throw new MergeDownloadError(
      "MERGE_MANIFEST_INVALID",
      "分片 SHA-256 校验值必须完整提供",
    );
  }
}

export function assertMergeManifest(value: unknown): asserts value is UploadManifest {
  assertManifestFields(value);
  assertManifestChunks(value);
}

export function signMergeToken(
  input: SignMergeTokenInput,
  secret: string,
  now: number = Date.now(),
): string {
  if (!secret) {
    throw new MergeDownloadError(
      "MERGE_SECRET_MISSING",
      "合并下载密钥未配置",
      503,
    );
  }

  assertStringField(input.roomId, "roomId", 128);
  assertMergeManifest(input.manifest);

  const payload: MergeTokenPayload = {
    v: 1,
    roomId: input.roomId,
    issuedAt: now,
    manifest: input.manifest,
  };
  const body = encodeBase64Url(
    deflateRawSync(Buffer.from(JSON.stringify(payload), "utf8")),
  );
  const token = `${MERGE_TOKEN_VERSION}.${body}.${encodeBase64Url(signBody(body, secret))}`;

  if (token.length > MERGE_TOKEN_MAX_LENGTH) {
    throw new MergeDownloadError("MERGE_TOKEN_TOO_LARGE", "分片清单过大");
  }

  return token;
}

function assertTokenPayload(value: unknown): asserts value is MergeTokenPayload {
  if (!value || typeof value !== "object") {
    throw new MergeDownloadError("MERGE_TOKEN_INVALID", "合并下载令牌内容无效");
  }

  const payload = value as Record<string, unknown>;
  if (payload.v !== 1) {
    throw new MergeDownloadError("MERGE_TOKEN_VERSION", "合并下载令牌版本不支持");
  }

  assertStringField(payload.roomId, "roomId", 128);

  if (
    !Number.isSafeInteger(payload.issuedAt) ||
    (payload.issuedAt as number) <= 0
  ) {
    throw new MergeDownloadError("MERGE_TOKEN_INVALID", "合并下载令牌字段无效");
  }

  assertMergeManifest(payload.manifest);
}

function parseMergeToken(token: string, secret: string): unknown {
  if (
    typeof token !== "string" ||
    token.length === 0 ||
    token.length > MERGE_TOKEN_MAX_LENGTH
  ) {
    throw new MergeDownloadError("MERGE_TOKEN_INVALID", "合并下载令牌格式无效");
  }

  const parts = token.split(".");
  if (
    parts.length !== 3 ||
    parts[0] !== MERGE_TOKEN_VERSION ||
    !parts[1] ||
    !parts[2]
  ) {
    throw new MergeDownloadError("MERGE_TOKEN_INVALID", "合并下载令牌格式无效");
  }

  const [, body, signature] = parts;
  const expected = signBody(body, secret);
  const received = Buffer.from(signature, "base64url");

  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    throw new MergeDownloadError("MERGE_TOKEN_SIGNATURE", "合并下载令牌签名无效");
  }

  try {
    const inflated = inflateRawSync(Buffer.from(body, "base64url"), {
      maxOutputLength: MERGE_TOKEN_MAX_INFLATED_BYTES,
    });
    return JSON.parse(inflated.toString("utf8"));
  } catch {
    throw new MergeDownloadError("MERGE_TOKEN_INVALID", "合并下载令牌内容无效");
  }
}

export function verifyMergeToken(
  token: string,
  secret: string,
  expectedRoomId?: string,
): MergeTokenPayload {
  if (!secret) {
    throw new MergeDownloadError(
      "MERGE_SECRET_MISSING",
      "合并下载密钥未配置",
      503,
    );
  }

  const payload = parseMergeToken(token, secret);
  assertTokenPayload(payload);

  if (expectedRoomId && payload.roomId !== expectedRoomId) {
    throw new MergeDownloadError(
      "MERGE_ROOM_MISMATCH",
      "合并下载令牌与当前房间不匹配",
      403,
    );
  }

  return payload;
}

function encodeRfc5987(value: string): string {
  return encodeURIComponent(value).replace(/['()*]/g, (character) => {
    return `%${character.charCodeAt(0).toString(16).toUpperCase()}`;
  });
}

export function buildContentDisposition(fileName: string): string {
  const safeName = sanitizeUploadFileName(fileName);
  const asciiName = safeName
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\]/g, "_");

  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeRfc5987(safeName)}`;
}

export function buildMergeUrl(roomCode: string, token: string): string {
  return `/api/rooms/${encodeURIComponent(roomCode)}/attachments/merge?manifest=${encodeURIComponent(token)}`;
}

function combineSignals(signals: Array<AbortSignal | undefined>): AbortSignal {
  const active = signals.filter((signal): signal is AbortSignal => Boolean(signal));
  if (active.length === 1) {
    return active[0];
  }

  return AbortSignal.any(active);
}

async function requestChunk(
  url: string,
  index: number,
  fetchImpl: typeof fetch,
  signal: AbortSignal,
): Promise<Response> {
  try {
    return await fetchImpl(url, {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      signal,
    });
  } catch {
    throw new MergeDownloadError(
      "MERGE_CHUNK_FETCH_FAILED",
      `分片 ${index + 1} 下载失败`,
      502,
      { chunkIndex: index },
    );
  }
}

function resolveRedirect(
  response: Response,
  currentUrl: string,
  service: UploadManifest["service"],
  index: number,
): string | null {
  if (response.status < 300 || response.status >= 400) {
    return null;
  }

  const location = response.headers.get("location");
  if (!location) {
    throw new MergeDownloadError("MERGE_CHUNK_REDIRECT_INVALID", "分片重定向地址无效", 502, {
      chunkIndex: index,
    });
  }

  let nextUrl: string;
  try {
    nextUrl = new URL(location, currentUrl).toString();
  } catch {
    throw new MergeDownloadError("MERGE_CHUNK_REDIRECT_INVALID", "分片重定向地址无效", 502, {
      chunkIndex: index,
    });
  }

  if (!isAllowedRemoteUrl(service, nextUrl)) {
    throw new MergeDownloadError("MERGE_CHUNK_URL_INVALID", "分片地址不受信任", 502, {
      chunkIndex: index,
    });
  }

  return nextUrl;
}

async function fetchChunk(
  manifest: UploadManifest,
  index: number,
  fetchImpl: typeof fetch,
  signal: AbortSignal,
): Promise<Response> {
  const chunk = manifest.chunks[index];
  let currentUrl = chunk.url;

  for (let hop = 0; hop <= MERGE_MAX_REDIRECTS; hop += 1) {
    const response = await requestChunk(currentUrl, index, fetchImpl, signal);
    const nextUrl = resolveRedirect(response, currentUrl, manifest.service, index);

    if (nextUrl) {
      currentUrl = nextUrl;
      continue;
    }

    if (!response.ok || !response.body) {
      throw new MergeDownloadError(
        "MERGE_CHUNK_HTTP_ERROR",
        `分片 ${index + 1} 下载失败（HTTP ${response.status}）`,
        502,
        { chunkIndex: index, status: response.status },
      );
    }

    if (response.url && !isAllowedRemoteUrl(manifest.service, response.url)) {
      throw new MergeDownloadError("MERGE_CHUNK_URL_INVALID", "分片地址不受信任", 502, {
        chunkIndex: index,
      });
    }

    const contentLength = response.headers.get("content-length");
    if (contentLength !== null && Number(contentLength) !== chunk.sizeBytes) {
      throw new MergeDownloadError(
        "MERGE_CHUNK_LENGTH_MISMATCH",
        `分片 ${index + 1} 长度与清单不一致`,
        502,
        {
          chunkIndex: index,
          expectedSize: chunk.sizeBytes,
          actualSize: Number(contentLength),
        },
      );
    }

    return response;
  }

  throw new MergeDownloadError(
    "MERGE_CHUNK_REDIRECT_LIMIT",
    `分片 ${index + 1} 重定向次数过多`,
    502,
    { chunkIndex: index },
  );
}

async function readChunkBytes(
  response: Response,
  chunk: UploadManifest["chunks"][number],
  index: number,
  onBytes?: (value: Uint8Array) => void,
): Promise<{ received: number; sha256: string }> {
  const reader = response.body!.getReader();
  const hash = createHash("sha256");
  let received = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      received += value.byteLength;
      if (received > chunk.sizeBytes) {
        throw new MergeDownloadError(
          "MERGE_CHUNK_SIZE_MISMATCH",
          `分片 ${index + 1} 大小与清单不一致`,
          502,
          { chunkIndex: index, expectedSize: chunk.sizeBytes, actualSize: received },
        );
      }

      hash.update(value);
      onBytes?.(value);
    }
  } catch (error) {
    if (error instanceof MergeDownloadError) {
      throw error;
    }
    throw new MergeDownloadError(
      "MERGE_CHUNK_READ_FAILED",
      `分片 ${index + 1} 读取失败`,
      502,
      { chunkIndex: index },
    );
  } finally {
    reader.releaseLock();
  }

  if (received !== chunk.sizeBytes) {
    throw new MergeDownloadError(
      "MERGE_CHUNK_SIZE_MISMATCH",
      `分片 ${index + 1} 大小与清单不一致`,
      502,
      { chunkIndex: index, expectedSize: chunk.sizeBytes, actualSize: received },
    );
  }

  const actualSha256 = hash.digest("hex");
  const expectedSha256 = normalizeSha256(chunk.sha256);
  if (expectedSha256 && actualSha256 !== expectedSha256) {
    throw new MergeDownloadError(
      "MERGE_CHUNK_HASH_MISMATCH",
      `分片 ${index + 1} SHA-256 校验失败`,
      502,
      {
        chunkIndex: index,
        expectedSha256,
        actualSha256,
      },
    );
  }

  return { received, sha256: actualSha256 };
}

async function pumpChunk(
  controller: ReadableStreamDefaultController<Uint8Array>,
  response: Response,
  chunk: UploadManifest["chunks"][number],
  index: number,
): Promise<void> {
  await readChunkBytes(response, chunk, index, (value) => {
    controller.enqueue(value);
  });
}

export type MergeIntegrityFailure = {
  index: number;
  code: string;
  message: string;
  expectedSize: number;
  actualSize?: number;
  expectedSha256?: string;
  actualSha256?: string;
};

export type MergeIntegrityReport = {
  valid: boolean;
  integrity: "sha256" | "none";
  totalChunks: number;
  checkedChunks: number;
  failures: MergeIntegrityFailure[];
};

export type VerifyMergedManifestOptions = OpenMergedStreamOptions & {
  indexes?: number[];
};

function toIntegrityFailure(
  manifest: UploadManifest,
  index: number,
  error: unknown,
): MergeIntegrityFailure {
  const chunk = manifest.chunks[index];
  const base = {
    index,
    expectedSize: chunk.sizeBytes,
    expectedSha256: normalizeSha256(chunk.sha256) ?? undefined,
  };

  if (error instanceof MergeDownloadError) {
    const details = (error.details ?? {}) as {
      actualSize?: number;
      actualSha256?: string;
    };

    return {
      ...base,
      code: error.code,
      message: error.message,
      actualSize: details.actualSize,
      actualSha256: details.actualSha256,
    };
  }

  return {
    ...base,
    code: "MERGE_CHUNK_READ_FAILED",
    message: `分片 ${index + 1} 校验失败`,
  };
}

export async function verifyMergedManifest(
  manifest: UploadManifest,
  options: VerifyMergedManifestOptions = {},
): Promise<MergeIntegrityReport> {
  assertMergeManifest(manifest);

  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? UPLOAD_REMOTE_TIMEOUT_MS;
  const requested =
    options.indexes && options.indexes.length > 0
      ? options.indexes
      : Array.from({ length: manifest.totalChunks }, (_, index) => index);
  const indexes = Array.from(new Set(requested)).sort((left, right) => left - right);

  for (const index of indexes) {
    if (
      !Number.isSafeInteger(index) ||
      index < 0 ||
      index >= manifest.totalChunks
    ) {
      throw new MergeDownloadError(
        "MERGE_VERIFY_INDEX_INVALID",
        "校验分片索引超出范围",
        400,
        { chunkIndex: index },
      );
    }
  }

  const failures: MergeIntegrityFailure[] = [];

  for (const index of indexes) {
    const controller = new AbortController();
    const signal = combineSignals([
      controller.signal,
      options.signal,
      AbortSignal.timeout(timeoutMs),
    ]);

    try {
      const response = await fetchChunk(manifest, index, fetchImpl, signal);
      await readChunkBytes(response, manifest.chunks[index], index);
    } catch (error) {
      failures.push(toIntegrityFailure(manifest, index, error));
    } finally {
      controller.abort();
    }
  }

  return {
    valid: failures.length === 0,
    integrity: manifestIntegrity(manifest.chunks),
    totalChunks: manifest.totalChunks,
    checkedChunks: indexes.length,
    failures,
  };
}

export async function openMergedStream(
  manifest: UploadManifest,
  options: OpenMergedStreamOptions = {},
): Promise<ReadableStream<Uint8Array>> {
  assertMergeManifest(manifest);

  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? UPLOAD_REMOTE_TIMEOUT_MS;
  const controller = new AbortController();

  const fetchSignal = () =>
    combineSignals([
      controller.signal,
      options.signal,
      AbortSignal.timeout(timeoutMs),
    ]);

  const firstResponse = await fetchChunk(manifest, 0, fetchImpl, fetchSignal());

  return new ReadableStream<Uint8Array>({
    async start(streamController) {
      try {
        for (let index = 0; index < manifest.totalChunks; index += 1) {
          const response =
            index === 0
              ? firstResponse
              : await fetchChunk(manifest, index, fetchImpl, fetchSignal());

          await pumpChunk(streamController, response, manifest.chunks[index], index);
        }
        try {
          streamController.close();
        } catch {
          // The consumer may have cancelled while the last chunk was in flight.
        }
      } catch (error) {
        try {
          streamController.error(error);
        } catch {
          // The stream is already closed or cancelled.
        }
      }
    },
    cancel() {
      controller.abort();
    },
  });
}
