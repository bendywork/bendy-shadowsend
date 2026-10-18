import { describe, expect, it, vi } from "vitest";

import {
  ChunkSchedulerConfigError,
  runChunkScheduler,
  type ChunkSchedulerProgress,
} from "@/lib/upload/chunk-scheduler";
import type { UploadChunkDescriptor } from "@/lib/upload/types";

const TOTAL_BYTES = 1000;
const CHUNK_SIZE = 250;
const TOTAL_CHUNKS = 4;

function descriptor(index: number): UploadChunkDescriptor {
  return {
    index,
    url: `https://pic.sl.al/f/${index}`,
    sizeBytes: CHUNK_SIZE,
  };
}

function baseOptions() {
  return {
    totalBytes: TOTAL_BYTES,
    chunkSize: CHUNK_SIZE,
    totalChunks: TOTAL_CHUNKS,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("runChunkScheduler", () => {
  it("bounds concurrency and accepts out-of-order completion", async () => {
    const gates = Array.from({ length: TOTAL_CHUNKS }, () => deferred<void>());
    let inFlight = 0;
    let maxInFlight = 0;
    const started: number[] = [];

    const run = runChunkScheduler({
      ...baseOptions(),
      concurrency: 4,
      maxAttempts: 1,
      uploadChunk: async (index) => {
        started.push(index);
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await gates[index].promise;
        inFlight -= 1;
        return descriptor(index);
      },
    });

    await vi.waitFor(() => expect(started).toHaveLength(4));
    gates[2].resolve();
    gates[0].resolve();
    gates[3].resolve();
    gates[1].resolve();

    const result = await run;
    expect(result.status).toBe("done");
    expect(result.chunks.map((chunk) => chunk.index)).toEqual([0, 1, 2, 3]);
    expect(maxInFlight).toBe(4);
    expect(result.uploadedBytes).toBe(TOTAL_BYTES);
  });

  it("retries retryable chunk failures with backoff", async () => {
    const sleep = vi.fn(async () => undefined);
    const progress: ChunkSchedulerProgress[] = [];
    const attemptsByIndex = new Map<number, number>();

    const result = await runChunkScheduler({
      ...baseOptions(),
      concurrency: 1,
      maxAttempts: 3,
      sleep,
      onProgress: (state) => progress.push(state),
      uploadChunk: async (index) => {
        const attempts = (attemptsByIndex.get(index) ?? 0) + 1;
        attemptsByIndex.set(index, attempts);
        if (index === 1 && attempts < 2) {
          throw Object.assign(new Error("暂时失败"), { retryable: true });
        }
        return descriptor(index);
      },
    });

    expect(result.status).toBe("done");
    expect(attemptsByIndex.get(1)).toBe(2);
    expect(sleep).toHaveBeenCalledWith(400);
    expect(progress.some((state) => state.status === "retrying")).toBe(true);
  });

  it("pauses after exhausting attempts and keeps finished chunks", async () => {
    const uploadChunk = vi.fn(async (index: number) => {
      if (index === 1) {
        throw Object.assign(new Error("分片服务不可用"), { retryable: true });
      }
      return descriptor(index);
    });

    const result = await runChunkScheduler({
      ...baseOptions(),
      concurrency: 1,
      maxAttempts: 3,
      sleep: async () => undefined,
      uploadChunk,
    });

    expect(result.status).toBe("paused");
    expect(result.failedChunkIndex).toBe(1);
    expect(result.chunks.map((chunk) => chunk.index)).toEqual([0]);
    expect(result.uploadedBytes).toBe(CHUNK_SIZE);
    expect(result.error).toBeInstanceOf(Error);
    expect(uploadChunk).toHaveBeenCalledTimes(4);
  });

  it("does not retry non-retryable failures", async () => {
    const uploadChunk = vi.fn(async () => {
      throw Object.assign(new Error("文件类型不支持"), { retryable: false });
    });

    const result = await runChunkScheduler({
      ...baseOptions(),
      concurrency: 1,
      maxAttempts: 3,
      sleep: async () => undefined,
      uploadChunk,
    });

    expect(result.status).toBe("paused");
    expect(uploadChunk).toHaveBeenCalledTimes(1);
  });

  it("skips chunks recorded by an earlier attempt", async () => {
    const uploadChunk = vi.fn(async (index: number) => descriptor(index));

    const result = await runChunkScheduler({
      ...baseOptions(),
      initialChunks: [descriptor(0), descriptor(3)],
      concurrency: 2,
      maxAttempts: 1,
      uploadChunk,
    });

    expect(result.status).toBe("done");
    expect(uploadChunk.mock.calls.map(([index]) => index)).toEqual([1, 2]);
    expect(result.uploadedBytes).toBe(TOTAL_BYTES);
  });

  it("stops in-flight work when aborted", async () => {
    const controller = new AbortController();
    const started = deferred<void>();

    const run = runChunkScheduler({
      ...baseOptions(),
      concurrency: 1,
      maxAttempts: 3,
      signal: controller.signal,
      uploadChunk: (_index, context) => {
        started.resolve();
        return new Promise((_resolve, reject) => {
          context.signal.addEventListener("abort", () => {
            reject(Object.assign(new Error("已取消"), { retryable: false }));
          });
        });
      },
    });

    await started.promise;
    controller.abort();

    const result = await run;
    expect(result.status).toBe("aborted");
    expect(result.chunks).toHaveLength(0);
  });

  it("reports partial progress while a chunk uploads", async () => {
    const progress: ChunkSchedulerProgress[] = [];

    await runChunkScheduler({
      ...baseOptions(),
      concurrency: 1,
      maxAttempts: 1,
      onProgress: (state) => progress.push(state),
      uploadChunk: async (index, context) => {
        context.onProgress(CHUNK_SIZE / 2);
        return descriptor(index);
      },
    });

    expect(
      progress.some(
        (state) =>
          state.uploadedBytes > 0 && state.uploadedBytes < TOTAL_BYTES,
      ),
    ).toBe(true);
    expect(progress.at(-1)?.percent).toBe(100);
  });

  it("rejects inconsistent plans and invalid resume chunks", async () => {
    await expect(
      runChunkScheduler({
        ...baseOptions(),
        totalChunks: 3,
        uploadChunk: async (index) => descriptor(index),
      }),
    ).rejects.toBeInstanceOf(ChunkSchedulerConfigError);

    await expect(
      runChunkScheduler({
        ...baseOptions(),
        initialChunks: [
          { index: 0, url: "https://pic.sl.al/a", sizeBytes: 10 },
        ],
        uploadChunk: async (index) => descriptor(index),
      }),
    ).rejects.toBeInstanceOf(ChunkSchedulerConfigError);
  });

  it("rejects invalid chunk descriptors returned by the transport", async () => {
    const result = await runChunkScheduler({
      ...baseOptions(),
      concurrency: 1,
      maxAttempts: 1,
      uploadChunk: async (index) => ({
        index,
        url: "https://pic.sl.al/a",
        sizeBytes: 1,
      }),
    });

    expect(result.status).toBe("paused");
    expect(result.failedChunkIndex).toBe(0);
  });
});
