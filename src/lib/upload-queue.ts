import type { AttachmentItem } from "@/types/chat";

/** Upload task lifecycle used by the composer attachment tray. */
export type UploadTaskStatus = "queued" | "uploading" | "done" | "failed";

export type UploadResult = {
  s3Key: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storage: AttachmentItem["storage"];
  previewUrl?: string | null;
};

export type UploadTask = {
  id: string;
  file: File;
  status: UploadTaskStatus;
  /** 0-100, weighted by bytes in the summary. */
  progress: number;
  /** Set while a chunked upload is running. */
  chunkIndex: number | null;
  chunkCount: number | null;
  error: string | null;
  result?: UploadResult;
};

export type UploadProgress = {
  percent: number;
  chunkIndex?: number;
  chunkCount?: number;
};

export type UploadSummary = {
  total: number;
  done: number;
  failed: number;
  uploading: number;
  queued: number;
  percent: number;
  active: boolean;
  allDone: boolean;
  hasFailure: boolean;
};

export const MAX_COMPOSER_FILES = 20;
export const MAX_CONCURRENT_UPLOADS = 3;

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function createUploadTask(file: File, id: string): UploadTask {
  return {
    id,
    file,
    status: "queued",
    progress: 0,
    chunkIndex: null,
    chunkCount: null,
    error: null,
  };
}

/** Number of chunks the current image path would use; useful for labels/tests. */
export function getChunkCount(
  sizeBytes: number,
  chunkSizeBytes: number,
): number {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || chunkSizeBytes <= 0) {
    return 1;
  }
  return Math.max(1, Math.ceil(sizeBytes / chunkSizeBytes));
}

export function applyUploadProgress(
  task: UploadTask,
  update: UploadProgress,
): UploadTask {
  return {
    ...task,
    status: task.status === "done" ? task.status : "uploading",
    progress: clampPercent(update.percent),
    chunkIndex:
      update.chunkIndex === undefined ? task.chunkIndex : update.chunkIndex,
    chunkCount:
      update.chunkCount === undefined ? task.chunkCount : update.chunkCount,
    error: null,
  };
}

export function markUploadDone(
  task: UploadTask,
  result: UploadResult,
): UploadTask {
  return {
    ...task,
    status: "done",
    progress: 100,
    chunkIndex: task.chunkCount ? task.chunkCount - 1 : task.chunkIndex,
    error: null,
    result,
  };
}

export function markUploadFailed(task: UploadTask, error: string): UploadTask {
  return {
    ...task,
    status: "failed",
    error,
  };
}

export function resetUploadTask(task: UploadTask): UploadTask {
  return {
    ...task,
    status: "queued",
    progress: 0,
    chunkIndex: null,
    chunkCount: null,
    error: null,
    result: undefined,
  };
}

export function summarizeUploads(tasks: UploadTask[]): UploadSummary {
  const total = tasks.length;
  const done = tasks.filter((task) => task.status === "done").length;
  const failed = tasks.filter((task) => task.status === "failed").length;
  const uploading = tasks.filter((task) => task.status === "uploading").length;
  const queued = tasks.filter((task) => task.status === "queued").length;
  const totalBytes = tasks.reduce((sum, task) => sum + task.file.size, 0);
  const loadedBytes = tasks.reduce(
    (sum, task) => sum + task.file.size * (task.progress / 100),
    0,
  );

  return {
    total,
    done,
    failed,
    uploading,
    queued,
    percent:
      totalBytes > 0
        ? clampPercent((loadedBytes / totalBytes) * 100)
        : done === total && total > 0
          ? 100
          : 0,
    active: uploading > 0 || queued > 0,
    allDone: total > 0 && done === total,
    hasFailure: failed > 0,
  };
}

/** Select the next queued tasks that fit the concurrency budget. */
export function takeNextUploads(
  tasks: UploadTask[],
  limit = MAX_CONCURRENT_UPLOADS,
): UploadTask[] {
  if (limit <= 0) return [];
  const active = tasks.filter((task) => task.status === "uploading").length;
  const slots = Math.max(0, limit - active);
  if (slots === 0) return [];
  return tasks.filter((task) => task.status === "queued").slice(0, slots);
}

export function canSubmitComposer(
  text: string,
  tasks: UploadTask[],
): boolean {
  if (tasks.some((task) => task.status !== "done")) return false;
  return text.trim().length > 0 || tasks.length > 0;
}
