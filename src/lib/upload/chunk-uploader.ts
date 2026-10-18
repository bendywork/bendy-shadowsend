import {
  UPLOAD_CHUNK_MAX_ATTEMPTS,
  UPLOAD_CHUNK_MAX_RETRY_DELAY_MS,
  UPLOAD_CHUNK_RETRY_DELAY_MS,
} from "@/lib/upload/constants";
import {
  ChunkTransportError,
  type ChunkTransport,
  type CompletedUpload,
  type UploadSessionInfo,
} from "@/lib/upload/chunk-transport";
import {
  runChunkScheduler,
  type ChunkSchedulerProgress,
  type ChunkSchedulerResult,
} from "@/lib/upload/chunk-scheduler";
import {
  createUploadFingerprint,
  createUploadResumeRecord,
  findUploadResumeRecord,
  removeUploadResumeRecord,
  resolveUploadResumeStorage,
  saveUploadResumeRecord,
  type UploadResumeRecord,
  type UploadResumeStorage,
} from "@/lib/upload/resume-store";
import type { UploadChunkDescriptor } from "@/lib/upload/types";

export type UploadProgressStatus =
  | "queued"
  | "uploading"
  | "retrying"
  | "done"
  | "failed";

export type UploadProgressState = {
  status: UploadProgressStatus;
  progress: number;
  attempt: number;
  maxAttempts: number;
  error?: string;
};

export type ChunkedUploadOptions = {
  roomCode: string;
  file: File;
  transport: ChunkTransport;
  concurrency?: number;
  maxAttempts?: number;
  signal?: AbortSignal;
  onProgress?: (state: UploadProgressState) => void;
  resumeStorage?: UploadResumeStorage | null;
  now?: () => number;
};

export type ChunkedUploadResult = {
  status: "done" | "paused" | "aborted";
  upload: CompletedUpload | null;
  completedChunks: number;
  totalChunks: number;
  uploadedBytes: number;
  totalBytes: number;
  failedChunkIndex: number | null;
  error: unknown;
  resumeRecord: UploadResumeRecord | null;
};

type PreparedUpload = {
  session: UploadSessionInfo;
  record: UploadResumeRecord;
};

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function isSessionInvalid(error: unknown): boolean {
  return (
    error instanceof ChunkTransportError &&
    (error.status === 401 ||
      error.status === 403 ||
      error.code.startsWith("UPLOAD_SESSION_"))
  );
}

function emitProgress(
  options: ChunkedUploadOptions,
  state: UploadProgressState,
): void {
  try {
    options.onProgress?.(state);
  } catch {
    // A broken progress renderer must never fail the upload.
  }
}

function emitFailed(options: ChunkedUploadOptions, error: unknown): void {
  emitProgress(options, {
    status: "failed",
    progress: 0,
    attempt: 1,
    maxAttempts: options.maxAttempts ?? UPLOAD_CHUNK_MAX_ATTEMPTS,
    error: errorMessage(error),
  });
}

function isPlanConsistent(info: UploadSessionInfo, sizeBytes: number): boolean {
  if (!Number.isSafeInteger(info.chunkSize) || info.chunkSize <= 0) return false;
  if (!Number.isSafeInteger(info.totalChunks) || info.totalChunks <= 0) {
    return false;
  }
  if (info.totalChunks !== Math.ceil(sizeBytes / info.chunkSize)) return false;
  const lastChunkBytes = sizeBytes - (info.totalChunks - 1) * info.chunkSize;
  return info.lastChunkBytes === lastChunkBytes;
}

function sessionInfoFromRecord(record: UploadResumeRecord): UploadSessionInfo {
  return {
    session: record.session,
    service: record.service,
    storage: record.storage,
    chunkSize: record.chunkSize,
    totalChunks: record.totalChunks,
    lastChunkBytes: record.lastChunkBytes,
    expiresAt: record.expiresAt,
  };
}

function resolveStorage(
  options: Pick<ChunkedUploadOptions, "resumeStorage">,
): UploadResumeStorage | null {
  return options.resumeStorage === undefined
    ? resolveUploadResumeStorage()
    : options.resumeStorage;
}

function fingerprintFor(roomCode: string, file: File): string {
  return createUploadFingerprint({
    roomCode,
    fileName: file.name,
    sizeBytes: file.size,
    lastModified: file.lastModified,
  });
}

export function findResumableUpload(input: {
  roomCode: string;
  file: File;
  resumeStorage?: UploadResumeStorage | null;
  now?: number;
}): UploadResumeRecord | null {
  const storage = resolveStorage(input);
  if (!storage) return null;

  const now = input.now ?? Date.now();
  const record = findUploadResumeRecord(
    storage,
    fingerprintFor(input.roomCode, input.file),
    now,
  );

  if (!record || record.expiresAt <= now) return null;
  if (record.roomCode !== input.roomCode) return null;
  if (record.fileName !== input.file.name) return null;
  if (record.sizeBytes !== input.file.size) return null;
  if (record.lastModified !== input.file.lastModified) return null;

  return record;
}

async function prepareUpload(
  options: ChunkedUploadOptions,
  fingerprint: string,
  storage: UploadResumeStorage | null,
  now: number,
): Promise<PreparedUpload> {
  const existing = findResumableUpload({
    roomCode: options.roomCode,
    file: options.file,
    resumeStorage: storage,
    now,
  });

  if (existing) {
    return {
      session: sessionInfoFromRecord(existing),
      record: existing,
    };
  }

  if (storage) {
    removeUploadResumeRecord(storage, fingerprint);
  }

  const session = await options.transport.createSession(options.file, {
    signal: options.signal,
  });
  if (!isPlanConsistent(session, options.file.size)) {
    throw new ChunkTransportError("上传会话分片规划与文件不一致", {
      code: "UPLOAD_SESSION_INVALID",
      retryable: false,
    });
  }

  const record = createUploadResumeRecord({
    fingerprint,
    roomCode: options.roomCode,
    fileName: options.file.name,
    mimeType: options.file.type || "application/octet-stream",
    sizeBytes: options.file.size,
    lastModified: options.file.lastModified,
    session: session.session,
    service: session.service,
    storage: session.storage,
    chunkSize: session.chunkSize,
    totalChunks: session.totalChunks,
    lastChunkBytes: session.lastChunkBytes,
    expiresAt: session.expiresAt,
    completedChunks: [],
    now,
  });

  if (storage) saveUploadResumeRecord(storage, record);

  return { session, record };
}

function mergeCompletedChunk(
  record: UploadResumeRecord,
  chunk: UploadChunkDescriptor,
  now: number,
): UploadResumeRecord {
  const completedChunks = record.completedChunks.some(
    (existing) => existing.index === chunk.index,
  )
    ? record.completedChunks
    : [...record.completedChunks, { ...chunk }].sort(
        (left, right) => left.index - right.index,
      );

  return { ...record, completedChunks, updatedAt: now };
}

function uploadedBytesOf(record: UploadResumeRecord): number {
  return record.completedChunks.reduce(
    (sum, chunk) => sum + chunk.sizeBytes,
    0,
  );
}

function mapSchedulerProgress(
  progress: ChunkSchedulerProgress,
  errorText?: string,
): UploadProgressState {
  const status: UploadProgressStatus =
    progress.status === "retrying"
      ? "retrying"
      : progress.status === "running" || progress.status === "done"
        ? "uploading"
        : "failed";

  return {
    status,
    progress: progress.percent,
    attempt: progress.attempt,
    maxAttempts: progress.maxAttempts,
    error:
      status === "failed"
        ? errorText ?? "上传已暂停，可稍后继续"
        : undefined,
  };
}

function chunkBounds(
  chunkSize: number,
  index: number,
  totalBytes: number,
): { start: number; end: number } {
  const start = index * chunkSize;
  return { start, end: Math.min(totalBytes, start + chunkSize) };
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function completeRetryDelay(attempt: number): number {
  return Math.min(
    UPLOAD_CHUNK_MAX_RETRY_DELAY_MS,
    UPLOAD_CHUNK_RETRY_DELAY_MS * 2 ** Math.max(0, attempt - 1),
  );
}

async function completeWithRetry(
  options: ChunkedUploadOptions,
  session: string,
  chunks: UploadChunkDescriptor[],
): Promise<CompletedUpload> {
  const maxAttempts = Math.max(
    1,
    Math.floor(options.maxAttempts ?? UPLOAD_CHUNK_MAX_ATTEMPTS),
  );
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (options.signal?.aborted) {
      throw new ChunkTransportError("上传已取消", {
        code: "UPLOAD_ABORTED",
        retryable: false,
      });
    }

    try {
      return await options.transport.completeSession({
        session,
        chunks,
        signal: options.signal,
      });
    } catch (error) {
      lastError = error;
      const retryable =
        error instanceof ChunkTransportError ? error.retryable : true;
      if (!retryable || attempt >= maxAttempts) throw error;
      await defaultSleep(completeRetryDelay(attempt));
    }
  }

  throw lastError ?? new Error("合并上传失败");
}

async function finishCompletedUpload(
  options: ChunkedUploadOptions,
  result: ChunkSchedulerResult,
  record: UploadResumeRecord,
  storage: UploadResumeStorage | null,
): Promise<ChunkedUploadResult> {
  let upload: CompletedUpload;
  try {
    upload = await completeWithRetry(
      options,
      record.session,
      result.chunks,
    );
  } catch (error) {
    emitProgress(options, {
      status: "failed",
      progress: 99,
      attempt: result.attempt,
      maxAttempts: options.maxAttempts ?? UPLOAD_CHUNK_MAX_ATTEMPTS,
      error: errorMessage(error),
    });

    if (storage && isSessionInvalid(error)) {
      removeUploadResumeRecord(storage, record.fingerprint);
    }

    return {
      status: options.signal?.aborted ? "aborted" : "paused",
      upload: null,
      completedChunks: result.chunks.length,
      totalChunks: record.totalChunks,
      uploadedBytes: result.uploadedBytes,
      totalBytes: record.sizeBytes,
      failedChunkIndex: null,
      error,
      resumeRecord: isSessionInvalid(error) ? null : record,
    };
  }

  if (storage) removeUploadResumeRecord(storage, record.fingerprint);
  emitProgress(options, {
    status: "done",
    progress: 100,
    attempt: 1,
    maxAttempts: options.maxAttempts ?? UPLOAD_CHUNK_MAX_ATTEMPTS,
  });

  return {
    status: "done",
    upload,
    completedChunks: record.totalChunks,
    totalChunks: record.totalChunks,
    uploadedBytes: record.sizeBytes,
    totalBytes: record.sizeBytes,
    failedChunkIndex: null,
    error: null,
    resumeRecord: null,
  };
}

function pausedResult(
  options: ChunkedUploadOptions,
  result: ChunkSchedulerResult,
  record: UploadResumeRecord,
  resumeRecord: UploadResumeRecord | null = record,
): ChunkedUploadResult {
  const errorText = errorMessage(result.error ?? "上传已暂停");
  const progress =
    record.sizeBytes > 0
      ? Math.min(
          99,
          Math.floor((result.uploadedBytes / record.sizeBytes) * 100),
        )
      : 0;

  emitProgress(options, {
    status: "failed",
    progress,
    attempt: result.attempt,
    maxAttempts: options.maxAttempts ?? UPLOAD_CHUNK_MAX_ATTEMPTS,
    error: errorText,
  });

  return {
    status: result.status,
    upload: null,
    completedChunks: result.chunks.length,
    totalChunks: record.totalChunks,
    uploadedBytes: result.uploadedBytes,
    totalBytes: record.sizeBytes,
    failedChunkIndex: result.failedChunkIndex,
    error: result.error,
    resumeRecord,
  };
}

export async function uploadFileChunkedWithResume(
  options: ChunkedUploadOptions,
): Promise<ChunkedUploadResult> {
  if (!Number.isSafeInteger(options.file.size) || options.file.size <= 0) {
    const error = new ChunkTransportError("文件大小无效", {
      code: "UPLOAD_FILE_SIZE_INVALID",
      retryable: false,
    });
    emitFailed(options, error);
    return {
      status: "paused",
      upload: null,
      completedChunks: 0,
      totalChunks: 0,
      uploadedBytes: 0,
      totalBytes: Math.max(0, options.file.size),
      failedChunkIndex: null,
      error,
      resumeRecord: null,
    };
  }

  const now = options.now ? options.now() : Date.now();
  const storage = resolveStorage(options);
  const fingerprint = fingerprintFor(options.roomCode, options.file);

  let prepared: PreparedUpload;
  try {
    prepared = await prepareUpload(options, fingerprint, storage, now);
  } catch (error) {
    emitFailed(options, error);
    return {
      status: options.signal?.aborted ? "aborted" : "paused",
      upload: null,
      completedChunks: 0,
      totalChunks: 0,
      uploadedBytes: 0,
      totalBytes: options.file.size,
      failedChunkIndex: null,
      error,
      resumeRecord: null,
    };
  }

  let currentRecord = prepared.record;
  const resumedBytes = uploadedBytesOf(currentRecord);

  emitProgress(options, {
    status: "uploading",
    progress: Math.min(99, Math.floor((resumedBytes / options.file.size) * 100)),
    attempt: 1,
    maxAttempts: options.maxAttempts ?? UPLOAD_CHUNK_MAX_ATTEMPTS,
  });

  let result: ChunkSchedulerResult;
  try {
    result = await runChunkScheduler({
      totalBytes: options.file.size,
      chunkSize: currentRecord.chunkSize,
      totalChunks: currentRecord.totalChunks,
      initialChunks: currentRecord.completedChunks,
      concurrency: options.concurrency,
      maxAttempts: options.maxAttempts,
      signal: options.signal,
      onProgress: (progress) => {
        emitProgress(options, mapSchedulerProgress(progress));
      },
      onChunkComplete: async (chunk) => {
        currentRecord = mergeCompletedChunk(
          currentRecord,
          chunk,
          options.now ? options.now() : Date.now(),
        );
        if (storage) saveUploadResumeRecord(storage, currentRecord);
      },
      uploadChunk: async (index, context) => {
        const { start, end } = chunkBounds(
          currentRecord.chunkSize,
          index,
          options.file.size,
        );
        return options.transport.uploadChunk({
          session: currentRecord.session,
          index,
          blob: options.file.slice(start, end),
          signal: context.signal,
          onProgress: context.onProgress,
        });
      },
    });
  } catch (error) {
    emitFailed(options, error);
    return {
      status: options.signal?.aborted ? "aborted" : "paused",
      upload: null,
      completedChunks: currentRecord.completedChunks.length,
      totalChunks: currentRecord.totalChunks,
      uploadedBytes: uploadedBytesOf(currentRecord),
      totalBytes: currentRecord.sizeBytes,
      failedChunkIndex: null,
      error,
      resumeRecord: currentRecord,
    };
  }

  if (result.status === "done") {
    return finishCompletedUpload(options, result, currentRecord, storage);
  }

  if (storage && isSessionInvalid(result.error)) {
    removeUploadResumeRecord(storage, currentRecord.fingerprint);
    return pausedResult(options, result, currentRecord, null);
  }

  return pausedResult(options, result, currentRecord);
}

export function discardChunkedUpload(input: {
  roomCode: string;
  file: File;
  resumeStorage?: UploadResumeStorage | null;
}): void {
  const storage =
    input.resumeStorage === undefined
      ? resolveUploadResumeStorage()
      : input.resumeStorage;
  if (!storage) return;

  removeUploadResumeRecord(storage, fingerprintFor(input.roomCode, input.file));
}
