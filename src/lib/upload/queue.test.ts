import { describe, expect, it } from "vitest";

import {
  computeOverallProgress,
  createUploadQueue,
  type UploadQueueItem,
} from "@/lib/upload/queue";

function fakeFile(name: string, size: number, type = "application/octet-stream"): File {
  return { name, size, type } as File;
}

function retryableError(message: string): Error & { retryable: boolean } {
  return Object.assign(new Error(message), { retryable: true });
}

function fatalError(message: string): Error & { retryable: boolean; code: string } {
  return Object.assign(new Error(message), {
    retryable: false,
    code: "UPLOAD_FILE_TOO_LARGE",
  });
}

describe("computeOverallProgress", () => {
  it("weights each file by its byte size", () => {
    const items = [
      { sizeBytes: 100, progress: 100, status: "done" as const },
      { sizeBytes: 300, progress: 50, status: "uploading" as const },
    ];

    expect(computeOverallProgress(items)).toBe(63);
  });

  it("reports 100 only when every file is done", () => {
    expect(
      computeOverallProgress([
        { sizeBytes: 10, progress: 100, status: "done" as const },
        { sizeBytes: 10, progress: 100, status: "done" as const },
      ]),
    ).toBe(100);

    expect(
      computeOverallProgress([
        { sizeBytes: 10, progress: 100, status: "done" as const },
        { sizeBytes: 10, progress: 99, status: "uploading" as const },
      ]),
    ).toBe(99);
  });
});

describe("createUploadQueue", () => {
  it("runs no more than the configured number of uploads at once", async () => {
    const active = new Set<string>();
    let maxActive = 0;

    const queue = createUploadQueue<string>({
      files: [
        { id: "a", file: fakeFile("a.txt", 1) },
        { id: "b", file: fakeFile("b.txt", 1) },
        { id: "c", file: fakeFile("c.txt", 1) },
        { id: "d", file: fakeFile("d.txt", 1) },
      ],
      concurrency: 2,
      sleep: async () => undefined,
      upload: async (file) => {
        active.add(file.name);
        maxActive = Math.max(maxActive, active.size);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active.delete(file.name);
        return file.name;
      },
    });

    const snapshot = await queue.start();

    expect(maxActive).toBe(2);
    expect(snapshot.items.every((item) => item.status === "done")).toBe(true);
  });

  it("retries a failed file up to maxAttempts and then succeeds", async () => {
    let attempts = 0;

    const queue = createUploadQueue<string>({
      files: [{ id: "a", file: fakeFile("a.txt", 1) }],
      maxAttempts: 3,
      sleep: async () => undefined,
      upload: async () => {
        attempts += 1;
        if (attempts < 3) throw retryableError("temporary");
        return "ok";
      },
    });

    const snapshot = await queue.start();

    expect(attempts).toBe(3);
    expect(snapshot.items[0]).toMatchObject({
      status: "done",
      attempt: 3,
      progress: 100,
      result: "ok",
    });
  });

  it("stops after maxAttempts and keeps the failure reason", async () => {
    let attempts = 0;

    const queue = createUploadQueue<string>({
      files: [{ id: "a", file: fakeFile("a.txt", 1) }],
      maxAttempts: 3,
      sleep: async () => undefined,
      upload: async () => {
        attempts += 1;
        throw retryableError("upstream unavailable");
      },
    });

    const snapshot = await queue.start();

    expect(attempts).toBe(3);
    expect(snapshot.items[0]).toMatchObject({
      status: "failed",
      attempt: 3,
      error: "upstream unavailable",
    });
    expect(snapshot.failedCount).toBe(1);
  });

  it("does not retry a non-retryable failure", async () => {
    let attempts = 0;

    const queue = createUploadQueue<string>({
      files: [{ id: "a", file: fakeFile("a.txt", 1) }],
      maxAttempts: 3,
      sleep: async () => undefined,
      upload: async () => {
        attempts += 1;
        throw fatalError("file type blocked");
      },
    });

    const snapshot = await queue.start();

    expect(attempts).toBe(1);
    expect(snapshot.items[0]).toMatchObject({
      status: "failed",
      error: "file type blocked",
      errorCode: "UPLOAD_FILE_TOO_LARGE",
    });
  });

  it("retries only the requested file and leaves completed uploads untouched", async () => {
    const calls = new Map<string, number>();
    let failOnce = true;

    const queue = createUploadQueue<string>({
      files: [
        { id: "a", file: fakeFile("a.txt", 1) },
        { id: "b", file: fakeFile("b.txt", 1) },
      ],
      maxAttempts: 1,
      sleep: async () => undefined,
      upload: async (file) => {
        calls.set(file.name, (calls.get(file.name) ?? 0) + 1);
        if (file.name === "b.txt" && failOnce) {
          failOnce = false;
          throw retryableError("temporary");
        }
        return file.name;
      },
    });

    const first = await queue.start();
    expect(first.items.map((item) => item.status)).toEqual(["done", "failed"]);

    const second = await queue.retry("b");

    expect(calls.get("a.txt")).toBe(1);
    expect(calls.get("b.txt")).toBe(2);
    expect(second.items.every((item) => item.status === "done")).toBe(true);
  });

  it("retries every failed file through retryFailed", async () => {
    const attempts = new Map<string, number>();
    let failing = true;

    const queue = createUploadQueue<string>({
      files: [
        { id: "a", file: fakeFile("a.txt", 1) },
        { id: "b", file: fakeFile("b.txt", 1) },
        { id: "c", file: fakeFile("c.txt", 1) },
      ],
      maxAttempts: 1,
      concurrency: 2,
      sleep: async () => undefined,
      upload: async (file) => {
        attempts.set(file.name, (attempts.get(file.name) ?? 0) + 1);
        if (failing && file.name !== "a.txt") throw retryableError("temporary");
        return file.name;
      },
    });

    const first = await queue.start();
    expect(first.failedCount).toBe(2);

    failing = false;
    const second = await queue.retryFailed();

    expect(attempts.get("a.txt")).toBe(1);
    expect(second.failedCount).toBe(0);
    expect(second.items.every((item) => item.status === "done")).toBe(true);
  });

  it("publishes immutable snapshots with per-file progress", async () => {
    const queue = createUploadQueue<string>({
      files: [{ id: "a", file: fakeFile("a.txt", 100) }],
      sleep: async () => undefined,
      upload: async (_file, onProgress) => {
        onProgress(40);
        onProgress(100);
        return "ok";
      },
    });

    const snapshots: Array<UploadQueueItem<string>[]> = [];
    queue.subscribe((snapshot) => snapshots.push(snapshot.items));

    const final = await queue.start();
    const progressValues = snapshots.flat().map((item) => item.progress);

    expect(progressValues).toContain(40);
    expect(final.items[0].progress).toBe(100);

    final.items[0].status = "failed";
    expect(queue.getSnapshot().items[0].status).toBe("done");
  });
});
