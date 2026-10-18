export type UploadItemStatus =
  | "queued"
  | "uploading"
  | "retrying"
  | "done"
  | "failed";

export type UploadQueueItem<T> = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  status: UploadItemStatus;
  progress: number;
  attempt: number;
  maxAttempts: number;
  error?: string;
  errorCode?: string;
  result?: T;
};

export type UploadQueueSnapshot<T> = {
  items: UploadQueueItem<T>[];
  overallProgress: number;
  activeCount: number;
  doneCount: number;
  failedCount: number;
  isRunning: boolean;
};

export type UploadQueueFile = {
  id: string;
  file: File;
};

export type UploadQueueOptions<T> = {
  files: UploadQueueFile[];
  upload: (
    file: File,
    onProgress: (percent: number) => void,
    context: { attempt: number },
  ) => Promise<T>;
  concurrency?: number;
  maxAttempts?: number;
  retryDelayMs?: (attempt: number) => number;
  sleep?: (ms: number) => Promise<void>;
  isRetryable?: (error: unknown) => boolean;
  onUpdate?: (snapshot: UploadQueueSnapshot<T>) => void;
};

export type UploadQueue<T> = {
  start: () => Promise<UploadQueueSnapshot<T>>;
  retry: (id: string) => Promise<UploadQueueSnapshot<T>>;
  retryFailed: () => Promise<UploadQueueSnapshot<T>>;
  getSnapshot: () => UploadQueueSnapshot<T>;
  subscribe: (
    listener: (snapshot: UploadQueueSnapshot<T>) => void,
  ) => () => void;
};

type InternalItem<T> = UploadQueueItem<T> & { file: File };

type ProgressInput = Pick<UploadQueueItem<unknown>, "sizeBytes" | "progress" | "status">;

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function computeOverallProgress(items: ReadonlyArray<ProgressInput>): number {
  if (items.length === 0) return 0;
  if (items.every((item) => item.status === "done")) return 100;

  const totalBytes = items.reduce(
    (sum, item) => sum + Math.max(0, item.sizeBytes),
    0,
  );

  if (totalBytes <= 0) {
    const average =
      items.reduce((sum, item) => sum + clampPercent(item.progress), 0) /
      items.length;
    return Math.min(99, Math.round(average));
  }

  const loadedBytes = items.reduce(
    (sum, item) =>
      sum + Math.max(0, item.sizeBytes) * (clampPercent(item.progress) / 100),
    0,
  );

  return Math.min(99, Math.round((loadedBytes / totalBytes) * 100));
}

function defaultIsRetryable(error: unknown): boolean {
  if (error && typeof error === "object" && "retryable" in error) {
    return (error as { retryable?: unknown }).retryable !== false;
  }
  return true;
}

function readErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function toPublicItem<T>(item: InternalItem<T>): UploadQueueItem<T> {
  return {
    id: item.id,
    fileName: item.fileName,
    mimeType: item.mimeType,
    sizeBytes: item.sizeBytes,
    status: item.status,
    progress: item.progress,
    attempt: item.attempt,
    maxAttempts: item.maxAttempts,
    ...(item.error === undefined ? {} : { error: item.error }),
    ...(item.errorCode === undefined ? {} : { errorCode: item.errorCode }),
    ...(item.result === undefined ? {} : { result: item.result }),
  };
}

export function createUploadQueue<T>(
  options: UploadQueueOptions<T>,
): UploadQueue<T> {
  const concurrency = Math.max(1, Math.floor(options.concurrency ?? 3));
  const maxAttempts = Math.max(1, Math.floor(options.maxAttempts ?? 3));
  const sleep =
    options.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const retryDelayMs =
    options.retryDelayMs ??
    ((attempt: number) => Math.min(3000, 400 * 2 ** (attempt - 1)));
  const isRetryable = options.isRetryable ?? defaultIsRetryable;

  const items: InternalItem<T>[] = options.files.map(({ id, file }) => ({
    id,
    file,
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    sizeBytes: file.size,
    status: "queued",
    progress: 0,
    attempt: 0,
    maxAttempts,
  }));

  const listeners = new Set<(snapshot: UploadQueueSnapshot<T>) => void>();
  let activeCount = 0;
  let idleResolvers: Array<() => void> = [];

  function snapshot(): UploadQueueSnapshot<T> {
    const publicItems = items.map(toPublicItem);
    return {
      items: publicItems,
      overallProgress: computeOverallProgress(items),
      activeCount: publicItems.filter(
        (item) => item.status === "uploading" || item.status === "retrying",
      ).length,
      doneCount: publicItems.filter((item) => item.status === "done").length,
      failedCount: publicItems.filter((item) => item.status === "failed").length,
      isRunning:
        activeCount > 0 || items.some((item) => item.status === "queued"),
    };
  }

  function emit(): void {
    const next = snapshot();
    options.onUpdate?.(next);
    for (const listener of listeners) listener(next);
  }

  function isIdle(): boolean {
    return (
      activeCount === 0 && !items.some((item) => item.status === "queued")
    );
  }

  function resolveIdle(): void {
    const resolvers = idleResolvers;
    idleResolvers = [];
    for (const resolve of resolvers) resolve();
  }

  function waitForIdle(): Promise<UploadQueueSnapshot<T>> {
    if (isIdle()) return Promise.resolve(snapshot());
    return new Promise((resolve) => {
      idleResolvers.push(() => resolve(snapshot()));
    });
  }

  async function processItem(item: InternalItem<T>): Promise<void> {
    while (true) {
      item.attempt += 1;
      item.status = item.attempt > 1 ? "retrying" : "uploading";
      item.progress = 0;
      item.error = undefined;
      item.errorCode = undefined;
      emit();

      try {
        const result = await options.upload(
          item.file,
          (percent) => {
            const next = clampPercent(percent);
            if (next === item.progress) return;
            item.progress = next;
            emit();
          },
          { attempt: item.attempt },
        );

        item.result = result;
        item.status = "done";
        item.progress = 100;
        emit();
        return;
      } catch (error) {
        item.error = error instanceof Error ? error.message : String(error);
        item.errorCode = readErrorCode(error);

        if (!isRetryable(error) || item.attempt >= maxAttempts) {
          item.status = "failed";
          emit();
          return;
        }

        item.status = "retrying";
        emit();
        await sleep(retryDelayMs(item.attempt));
      }
    }
  }

  function pump(): void {
    while (activeCount < concurrency) {
      const next = items.find((item) => item.status === "queued");
      if (!next) break;

      activeCount += 1;
      void processItem(next).finally(() => {
        activeCount -= 1;
        pump();
      });
    }

    if (isIdle()) resolveIdle();
  }

  function resetForRetry(item: InternalItem<T>): void {
    item.status = "queued";
    item.attempt = 0;
    item.progress = 0;
    item.error = undefined;
    item.errorCode = undefined;
    item.result = undefined;
  }

  return {
    start(): Promise<UploadQueueSnapshot<T>> {
      pump();
      return waitForIdle();
    },

    retry(id: string): Promise<UploadQueueSnapshot<T>> {
      const item = items.find((candidate) => candidate.id === id);
      if (!item || item.status !== "failed") return waitForIdle();
      resetForRetry(item);
      emit();
      pump();
      return waitForIdle();
    },

    retryFailed(): Promise<UploadQueueSnapshot<T>> {
      const failed = items.filter((item) => item.status === "failed");
      if (failed.length === 0) return waitForIdle();
      for (const item of failed) resetForRetry(item);
      emit();
      pump();
      return waitForIdle();
    },

    getSnapshot(): UploadQueueSnapshot<T> {
      return snapshot();
    },

    subscribe(
      listener: (snapshot: UploadQueueSnapshot<T>) => void,
    ): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
