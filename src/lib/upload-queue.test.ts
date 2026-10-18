import { describe, expect, it } from "vitest";
import {
  applyUploadProgress,
  canSubmitComposer,
  createUploadTask,
  getChunkCount,
  markUploadDone,
  markUploadFailed,
  resetUploadTask,
  summarizeUploads,
  takeNextUploads,
  type UploadTask,
} from "@/lib/upload-queue";

function makeFile(size: number, name = "demo.png", type = "image/png") {
  return { size, name, type } as unknown as File;
}

function task(size: number, id: string): UploadTask {
  return createUploadTask(makeFile(size), id);
}

const result = {
  s3Key: "rooms/demo/demo.png",
  fileName: "demo.png",
  mimeType: "image/png",
  sizeBytes: 100,
  storage: "S3" as const,
  previewUrl: null,
};

describe("upload queue", () => {
  it("creates a queued task with zeroed progress", () => {
    const created = task(120, "a");

    expect(created).toMatchObject({
      id: "a",
      status: "queued",
      progress: 0,
      chunkIndex: null,
      chunkCount: null,
      error: null,
    });
  });

  it("computes chunk counts from the chunk size", () => {
    expect(getChunkCount(0, 3)).toBe(1);
    expect(getChunkCount(1, 3)).toBe(1);
    expect(getChunkCount(3, 3)).toBe(1);
    expect(getChunkCount(4, 3)).toBe(2);
    expect(getChunkCount(7, 3)).toBe(3);
  });

  it("applies progress immutably and clamps out-of-range values", () => {
    const original = task(100, "a");
    const updated = applyUploadProgress(original, {
      percent: 140,
      chunkIndex: 1,
      chunkCount: 3,
    });

    expect(original.status).toBe("queued");
    expect(original.progress).toBe(0);
    expect(updated).toMatchObject({
      status: "uploading",
      progress: 100,
      chunkIndex: 1,
      chunkCount: 3,
      error: null,
    });
  });

  it("keeps done tasks done when late progress arrives", () => {
    const done = markUploadDone(task(100, "a"), result);
    const late = applyUploadProgress(done, { percent: 20 });

    expect(late.status).toBe("done");
    expect(late.progress).toBe(20);
    expect(late.result).toBe(result);
  });

  it("marks failures and resets them for retry", () => {
    const failed = markUploadFailed(task(100, "a"), "网络错误");
    expect(failed.status).toBe("failed");
    expect(failed.error).toBe("网络错误");

    const reset = resetUploadTask(failed);
    expect(reset).toMatchObject({
      status: "queued",
      progress: 0,
      chunkIndex: null,
      chunkCount: null,
      error: null,
    });
    expect(reset.result).toBeUndefined();
  });

  it("summarizes progress weighted by file size", () => {
    const done = markUploadDone(task(100, "a"), result);
    const uploading = applyUploadProgress(task(300, "b"), { percent: 50 });
    const summary = summarizeUploads([done, uploading]);

    expect(summary).toMatchObject({
      total: 2,
      done: 1,
      failed: 0,
      uploading: 1,
      queued: 0,
      percent: 63,
      active: true,
      allDone: false,
      hasFailure: false,
    });
  });

  it("reports failures and full completion", () => {
    const done = markUploadDone(task(100, "a"), result);
    expect(summarizeUploads([done])).toMatchObject({
      percent: 100,
      active: false,
      allDone: true,
      hasFailure: false,
    });

    const failed = markUploadFailed(task(100, "b"), "boom");
    expect(summarizeUploads([done, failed])).toMatchObject({
      failed: 1,
      hasFailure: true,
      allDone: false,
    });
  });

  it("only returns queued tasks that fit the concurrency budget", () => {
    const uploading = [
      applyUploadProgress(task(100, "a"), { percent: 10 }),
      applyUploadProgress(task(100, "b"), { percent: 20 }),
    ];
    const queued = [task(100, "c"), task(100, "d")];

    expect(takeNextUploads([...uploading, ...queued], 3).map((item) => item.id)).toEqual([
      "c",
    ]);
    expect(takeNextUploads(queued, 0)).toEqual([]);
  });

  it("allows submit only when text or attachments exist and uploads finish", () => {
    const done = markUploadDone(task(100, "a"), result);
    const uploading = applyUploadProgress(task(100, "b"), { percent: 30 });

    expect(canSubmitComposer("", [])).toBe(false);
    expect(canSubmitComposer("hello", [])).toBe(true);
    expect(canSubmitComposer("", [done])).toBe(true);
    expect(canSubmitComposer("hello", [uploading])).toBe(false);
    expect(canSubmitComposer("   ", [done])).toBe(true);
  });
});
