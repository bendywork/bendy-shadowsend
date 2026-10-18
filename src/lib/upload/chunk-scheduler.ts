import {
  UPLOAD_CHUNK_CONCURRENCY,
  UPLOAD_CHUNK_MAX_ATTEMPTS,
  UPLOAD_CHUNK_MAX_RETRY_DELAY_MS,
  UPLOAD_CHUNK_RETRY_DELAY_MS,
} from "@/lib/upload/constants";
import type { UploadChunkDescriptor } from "@/lib/upload/types";

export type ChunkSchedulerStatus =
  | "running"
  | "retrying"
  | "paused"
  | "done"
  | "aborted";

export type ChunkSchedulerProgress = {
  status: ChunkSchedulerStatus;
  completedChunks: number;
  totalChunks: number;
  uploadedBytes: number;
  totalBytes: number;
  percent: number;
  activeChunks: number;
  attempt: number;
  maxAttempts: number;
  retryingChunkIndex: number | null;
  failedChunkIndex: number | null;
};

export type ChunkSchedulerResult = {
  status: "done" | "paused" | "aborted";
  chunks: UploadChunkDescriptor[];
  uploadedBytes: number;
  failedChunkIndex: number | null;
  attempt: number;
  error: unknown;
};

export type ChunkUploadContext = {
  signal: AbortSignal;
  onProgress: (loadedBytes: number) => void;
};

export type ChunkSchedulerOptions = {
  totalChunks: number;
  chunkSize: number;
  totalBytes: number;
  initialChunks?: UploadChunkDescriptor[];
  concurrency?: number;
  maxAttempts?: number;
  retryDelayMs?: (attempt: number) => number;
  sleep?: (ms: number) => Promise<void>;
  isRetryable?: (error: unknown) => boolean;
  uploadChunk: (
    index: number,
    context: ChunkUploadContext,
  ) => Promise<UploadChunkDescriptor>;
  onProgress?: (progress: ChunkSchedulerProgress) => void;
  onChunkComplete?: (
    chunk: UploadChunkDescriptor,
    progress: ChunkSchedulerProgress,
  ) => void | Promise<void>;
  signal?: AbortSignal;
};

export class ChunkSchedulerConfigError extends Error {
  readonly retryable = false;

  constructor(message: string) {
    super(message);
    this.name = "ChunkSchedulerConfigError";
  }
}

type ChunkFailure = {
  index: number;
  error: unknown;
};

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new ChunkSchedulerConfigError(`${label}无效`);
  }
}

export function expectedChunkBytesForPlan(params: {
  totalBytes: number;
  chunkSize: number;
  totalChunks: number;
  index: number;
}): number {
  const { totalBytes, chunkSize, totalChunks, index } = params;
  if (index < 0 || index >= totalChunks) {
    throw new ChunkSchedulerConfigError("分片索引超出范围");
  }
  return index === totalChunks - 1
    ? totalBytes - (totalChunks - 1) * chunkSize
    : chunkSize;
}

function validatePlan(options: ChunkSchedulerOptions): void {
  assertPositiveInteger(options.totalBytes, "文件大小");
  assertPositiveInteger(options.chunkSize, "分片大小");
  assertPositiveInteger(options.totalChunks, "分片数量");

  if (options.totalChunks !== Math.ceil(options.totalBytes / options.chunkSize)) {
    throw new ChunkSchedulerConfigError("分片规划不一致");
  }
}

function validateInitialChunks(
  options: ChunkSchedulerOptions,
): Map<number, UploadChunkDescriptor> {
  const chunks = new Map<number, UploadChunkDescriptor>();

  for (const chunk of options.initialChunks ?? []) {
    if (!Number.isSafeInteger(chunk.index) || chunk.index < 0) {
      throw new ChunkSchedulerConfigError("续传分片索引无效");
    }
    if (chunk.index >= options.totalChunks) {
      throw new ChunkSchedulerConfigError("续传分片索引超出范围");
    }
    if (chunks.has(chunk.index)) {
      throw new ChunkSchedulerConfigError("续传分片索引重复");
    }

    const expected = expectedChunkBytesForPlan({
      totalBytes: options.totalBytes,
      chunkSize: options.chunkSize,
      totalChunks: options.totalChunks,
      index: chunk.index,
    });
    if (chunk.sizeBytes !== expected) {
      throw new ChunkSchedulerConfigError("续传分片大小不匹配");
    }
    if (typeof chunk.url !== "string" || chunk.url.length === 0) {
      throw new ChunkSchedulerConfigError("续传分片地址无效");
    }

    chunks.set(chunk.index, {
      index: chunk.index,
      url: chunk.url,
      sizeBytes: chunk.sizeBytes,
    });
  }

  return chunks;
}

function defaultIsRetryable(error: unknown): boolean {
  if (error && typeof error === "object" && "retryable" in error) {
    return (error as { retryable?: unknown }).retryable !== false;
  }
  return true;
}

function defaultRetryDelay(attempt: number): number {
  return Math.min(
    UPLOAD_CHUNK_MAX_RETRY_DELAY_MS,
    UPLOAD_CHUNK_RETRY_DELAY_MS * 2 ** Math.max(0, attempt - 1),
  );
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function clampLoadedBytes(loadedBytes: number, maximum: number): number {
  if (!Number.isFinite(loadedBytes) || loadedBytes <= 0) return 0;
  return Math.min(maximum, Math.floor(loadedBytes));
}

function sortedChunks(
  chunks: Map<number, UploadChunkDescriptor>,
): UploadChunkDescriptor[] {
  return [...chunks.values()].sort((left, right) => left.index - right.index);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runChunkScheduler(
  options: ChunkSchedulerOptions,
): Promise<ChunkSchedulerResult> {
  validatePlan(options);

  const concurrency = Math.max(
    1,
    Math.min(
      options.totalChunks,
      Math.floor(options.concurrency ?? UPLOAD_CHUNK_CONCURRENCY),
    ),
  );
  const maxAttempts = Math.max(
    1,
    Math.floor(options.maxAttempts ?? UPLOAD_CHUNK_MAX_ATTEMPTS),
  );
  const retryDelayMs = options.retryDelayMs ?? defaultRetryDelay;
  const sleep = options.sleep ?? defaultSleep;
  const isRetryable = options.isRetryable ?? defaultIsRetryable;

  const chunks = validateInitialChunks(options);
  const pending: number[] = [];
  for (let index = 0; index < options.totalChunks; index += 1) {
    if (!chunks.has(index)) pending.push(index);
  }

  let completedBytes = 0;
  for (const chunk of chunks.values()) completedBytes += chunk.sizeBytes;

  const partialBytes = new Map<number, number>();
  const attempts = new Map<number, number>();
  const controller = new AbortController();

  let activeChunks = 0;
  let nextPending = 0;
  let aborted = false;
  let paused = false;
  let retryingChunkIndex: number | null = null;
  let failure: ChunkFailure | null = null;

  function currentFailure(): ChunkFailure | null {
    return failure;
  }

  function uploadedBytes(): number {
    let partial = 0;
    for (const [index, value] of partialBytes) {
      if (!chunks.has(index)) partial += value;
    }
    return Math.min(options.totalBytes, completedBytes + partial);
  }

  function currentAttempt(): number {
    let current = 1;
    for (const value of attempts.values()) {
      if (value > current) current = value;
    }
    return current;
  }

  function buildProgress(): ChunkSchedulerProgress {
    const status: ChunkSchedulerStatus = aborted
      ? "aborted"
      : failure && activeChunks === 0
        ? "paused"
        : chunks.size === options.totalChunks
          ? "done"
          : retryingChunkIndex !== null
            ? "retrying"
            : "running";

    const uploaded = uploadedBytes();
    const percent =
      chunks.size === options.totalChunks
        ? 100
        : Math.min(99, Math.floor((uploaded / options.totalBytes) * 100));

    return {
      status,
      completedChunks: chunks.size,
      totalChunks: options.totalChunks,
      uploadedBytes: uploaded,
      totalBytes: options.totalBytes,
      percent,
      activeChunks,
      attempt: currentAttempt(),
      maxAttempts,
      retryingChunkIndex,
      failedChunkIndex: failure?.index ?? null,
    };
  }

  function emit(): void {
    try {
      options.onProgress?.(buildProgress());
    } catch {
      // Progress rendering must never abort an upload.
    }
  }

  async function recordChunk(descriptor: UploadChunkDescriptor): Promise<void> {
    chunks.set(descriptor.index, descriptor);
    partialBytes.delete(descriptor.index);
    completedBytes += descriptor.sizeBytes;
    try {
      await options.onChunkComplete?.(descriptor, buildProgress());
    } catch {
      // Resume persistence is best-effort; the upload itself continues.
    }
    emit();
  }

  function invalidResult(index: number): ChunkSchedulerConfigError {
    return new ChunkSchedulerConfigError(`分片 ${index} 的上传结果无效`);
  }

  function validateResult(
    index: number,
    descriptor: UploadChunkDescriptor,
  ): ChunkSchedulerConfigError | null {
    if (descriptor.index !== index) return invalidResult(index);
    if (typeof descriptor.url !== "string" || descriptor.url.length === 0) {
      return invalidResult(index);
    }
    const expected = expectedChunkBytesForPlan({
      totalBytes: options.totalBytes,
      chunkSize: options.chunkSize,
      totalChunks: options.totalChunks,
      index,
    });
    if (descriptor.sizeBytes !== expected) return invalidResult(index);
    return null;
  }

  async function attemptChunk(index: number): Promise<boolean> {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (aborted || paused) return false;
      attempts.set(index, attempt);

      try {
        const descriptor = await options.uploadChunk(index, {
          signal: controller.signal,
          onProgress: (loadedBytes) => {
            const expected = expectedChunkBytesForPlan({
              totalBytes: options.totalBytes,
              chunkSize: options.chunkSize,
              totalChunks: options.totalChunks,
              index,
            });
            partialBytes.set(index, clampLoadedBytes(loadedBytes, expected));
            emit();
          },
        });

        const invalid = validateResult(index, descriptor);
        if (invalid) throw invalid;

        await recordChunk({
          index,
          url: descriptor.url,
          sizeBytes: descriptor.sizeBytes,
        });
        return true;
      } catch (error) {
        if (aborted || paused) return false;

        if (!isRetryable(error) || attempt >= maxAttempts) {
          if (!failure) failure = { index, error };
          paused = true;
          retryingChunkIndex = null;
          emit();
          return false;
        }

        retryingChunkIndex = index;
        emit();
        await sleep(retryDelayMs(attempt));
        retryingChunkIndex = null;
        emit();
      }
    }

    return false;
  }

  async function worker(): Promise<void> {
    while (!aborted && !paused) {
      const index = pending[nextPending];
      if (index === undefined) return;
      nextPending += 1;
      activeChunks += 1;
      emit();

      try {
        await attemptChunk(index);
      } finally {
        activeChunks -= 1;
        emit();
      }
    }
  }

  const onAbort = () => {
    aborted = true;
    paused = false;
    controller.abort();
    emit();
  };

  if (options.signal?.aborted) {
    onAbort();
  } else {
    options.signal?.addEventListener("abort", onAbort, { once: true });
  }

  if (!aborted && pending.length > 0) {
    const workers = Array.from({ length: concurrency }, () => worker());
    await Promise.all(workers);
  }

  options.signal?.removeEventListener("abort", onAbort);

  const finalChunks = sortedChunks(chunks);
  const finalBytes = finalChunks.reduce(
    (sum, chunk) => sum + chunk.sizeBytes,
    0,
  );
  const lastFailure = currentFailure();

  if (aborted) {
    return {
      status: "aborted",
      chunks: finalChunks,
      uploadedBytes: finalBytes,
      failedChunkIndex: lastFailure?.index ?? null,
      attempt: currentAttempt(),
      error: lastFailure?.error ?? null,
    };
  }

  if (lastFailure) {
    return {
      status: "paused",
      chunks: finalChunks,
      uploadedBytes: finalBytes,
      failedChunkIndex: lastFailure.index,
      attempt: currentAttempt(),
      error: lastFailure.error,
    };
  }

  if (finalChunks.length !== options.totalChunks) {
    return {
      status: "paused",
      chunks: finalChunks,
      uploadedBytes: finalBytes,
      failedChunkIndex: null,
      attempt: currentAttempt(),
      error: new ChunkSchedulerConfigError(
        `分片未全部完成（${finalChunks.length}/${options.totalChunks}）`,
      ),
    };
  }

  return {
    status: "done",
    chunks: finalChunks,
    uploadedBytes: finalBytes,
    failedChunkIndex: null,
    attempt: currentAttempt(),
    error: null,
  };
}

export function describeChunkSchedulerError(error: unknown): string {
  return errorMessage(error);
}
