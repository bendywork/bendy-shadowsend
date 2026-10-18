import { describe, expect, it, vi } from "vitest";

import {
  discardChunkedUpload,
  findResumableUpload,
  uploadFileChunkedWithResume,
  type UploadProgressState,
} from "@/lib/upload/chunk-uploader";
import {
  ChunkTransportError,
  type ChunkTransport,
  type UploadSessionInfo,
} from "@/lib/upload/chunk-transport";
import { UPLOAD_RESUME_STORAGE_KEY } from "@/lib/upload/constants";
import type { UploadResumeStorage } from "@/lib/upload/resume-store";

const NOW = 1_700_000_000_000;
const HOUR = 60 * 60 * 1000;

function makeFile(size: number, name = "video.mp4"): File {
  return new File([new Uint8Array(size)], name, {
    type: "video/mp4",
    lastModified: 123,
  });
}

function createMemoryStorage(): UploadResumeStorage & {
  dump: () => string | null;
} {
  let value: string | null = null;
  return {
    getItem: (key) => (key === UPLOAD_RESUME_STORAGE_KEY ? value : null),
    setItem: (key, next) => {
      if (key === UPLOAD_RESUME_STORAGE_KEY) value = next;
    },
    removeItem: (key) => {
      if (key === UPLOAD_RESUME_STORAGE_KEY) value = null;
    },
    dump: () => value,
  };
}

type FakeTransport = {
  transport: ChunkTransport;
  uploads: number[];
  createSession: ReturnType<typeof vi.fn>;
  completeSession: ReturnType<typeof vi.fn>;
  failChunks: Set<number>;
  retryOnceChunks: Set<number>;
};

function createFakeTransport(
  file: File,
  options: {
    chunkSize?: number;
    totalChunksOverride?: number;
    completeFailures?: number;
  } = {},
): FakeTransport {
  const chunkSize = options.chunkSize ?? 100;
  const totalChunks =
    options.totalChunksOverride ?? Math.ceil(file.size / chunkSize);
  const lastChunkBytes = file.size - (totalChunks - 1) * chunkSize;
  const uploads: number[] = [];
  const failChunks = new Set<number>();
  const retryOnceChunks = new Set<number>();
  const completeFailures = options.completeFailures ?? 0;
  let completeCalls = 0;

  const createSession = vi.fn(async (): Promise<UploadSessionInfo> => ({
    session: "session-1",
    service: "pic-sl",
    storage: "PIC_SL",
    chunkSize,
    totalChunks,
    lastChunkBytes,
    expiresAt: NOW + 2 * HOUR,
  }));

  const uploadChunk = vi.fn(
    async (input: {
      session: string;
      index: number;
      blob: Blob;
      onProgress?: (loadedBytes: number) => void;
    }) => {
      uploads.push(input.index);
      input.onProgress?.(input.blob.size);

      if (retryOnceChunks.has(input.index)) {
        retryOnceChunks.delete(input.index);
        throw new ChunkTransportError("暂时失败", { retryable: true });
      }
      if (failChunks.has(input.index)) {
        throw new ChunkTransportError("分片失败", { retryable: false });
      }

      return {
        index: input.index,
        url: `https://pic.sl.al/${input.index}`,
        sizeBytes: input.blob.size,
      };
    },
  );

  const completeSession = vi.fn(
    async (input: {
      session: string;
      chunks: { index: number; url: string; sizeBytes: number }[];
    }) => {
      completeCalls += 1;
      if (completeCalls <= completeFailures) {
        throw new ChunkTransportError("合并失败", { retryable: false });
      }
      return {
        uploadId: "upload-1",
        service: "pic-sl" as const,
        storage: "PIC_SL" as const,
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        chunkSize,
        totalChunks,
        chunks: input.chunks,
        mergeToken: "merge-token",
        mergeUrl: "/api/rooms/ROOM01/merge",
      };
    },
  );

  return {
    transport: {
      createSession,
      uploadChunk,
      completeSession,
    },
    uploads,
    createSession,
    completeSession,
    failChunks,
    retryOnceChunks,
  };
}

function baseOptions(file: File, fake: FakeTransport, storage: UploadResumeStorage) {
  return {
    roomCode: "ROOM01",
    file,
    transport: fake.transport,
    resumeStorage: storage,
    now: () => NOW,
  };
}

describe("uploadFileChunkedWithResume", () => {
  it("uploads every chunk, completes, and clears the resume record", async () => {
    const file = makeFile(250);
    const fake = createFakeTransport(file);
    const storage = createMemoryStorage();
    const progress: UploadProgressState[] = [];

    const result = await uploadFileChunkedWithResume({
      ...baseOptions(file, fake, storage),
      onProgress: (state) => progress.push(state),
    });

    expect(result.status).toBe("done");
    expect(result.upload?.mergeToken).toBe("merge-token");
    expect(fake.uploads.sort((left, right) => left - right)).toEqual([0, 1, 2]);
    expect(fake.createSession).toHaveBeenCalledTimes(1);
    expect(fake.completeSession).toHaveBeenCalledTimes(1);
    expect(storage.dump()).toBeNull();
    expect(progress.at(-1)).toEqual({
      status: "done",
      progress: 100,
      attempt: 1,
      maxAttempts: 3,
    });
  });

  it("pauses on a failed chunk and resumes without re-uploading", async () => {
    const file = makeFile(250);
    const fake = createFakeTransport(file);
    const storage = createMemoryStorage();
    fake.failChunks.add(1);

    const first = await uploadFileChunkedWithResume({
      ...baseOptions(file, fake, storage),
      concurrency: 1,
    });

    expect(first.status).toBe("paused");
    expect(first.completedChunks).toBe(1);
    expect(first.resumeRecord?.completedChunks.map((chunk) => chunk.index)).toEqual([
      0,
    ]);
    expect(storage.dump()).not.toBeNull();

    fake.failChunks.clear();
    const second = await uploadFileChunkedWithResume({
      ...baseOptions(file, fake, storage),
      concurrency: 1,
    });

    expect(second.status).toBe("done");
    expect(fake.createSession).toHaveBeenCalledTimes(1);
    expect(fake.uploads).toEqual([0, 1, 1, 2]);
    expect(storage.dump()).toBeNull();
  });

  it("keeps every chunk when merging fails and retries only the merge", async () => {
    const file = makeFile(250);
    const fake = createFakeTransport(file, { completeFailures: 1 });
    const storage = createMemoryStorage();

    const first = await uploadFileChunkedWithResume(
      baseOptions(file, fake, storage),
    );

    expect(first.status).toBe("paused");
    expect(first.resumeRecord?.completedChunks).toHaveLength(3);
    expect(fake.uploads).toEqual([0, 1, 2]);
    expect(storage.dump()).not.toBeNull();

    const second = await uploadFileChunkedWithResume(
      baseOptions(file, fake, storage),
    );

    expect(second.status).toBe("done");
    expect(fake.uploads).toEqual([0, 1, 2]);
    expect(fake.completeSession).toHaveBeenCalledTimes(2);
    expect(storage.dump()).toBeNull();
  });

  it("reports retry progress for transient chunk failures", async () => {
    const file = makeFile(150);
    const fake = createFakeTransport(file);
    const storage = createMemoryStorage();
    const progress: UploadProgressState[] = [];
    fake.retryOnceChunks.add(0);

    const result = await uploadFileChunkedWithResume({
      ...baseOptions(file, fake, storage),
      maxAttempts: 3,
      onProgress: (state) => progress.push(state),
    });

    expect(result.status).toBe("done");
    expect(progress.some((state) => state.status === "retrying")).toBe(true);
  });

  it("keeps a resume record when aborted", async () => {
    const file = makeFile(250);
    const fake = createFakeTransport(file);
    const storage = createMemoryStorage();
    const controller = new AbortController();
    controller.abort();

    const result = await uploadFileChunkedWithResume({
      ...baseOptions(file, fake, storage),
      signal: controller.signal,
    });

    expect(result.status).toBe("aborted");
    expect(fake.uploads).toEqual([]);
    expect(storage.dump()).not.toBeNull();
  });

  it("rejects sessions whose chunk plan does not match the file", async () => {
    const file = makeFile(250);
    const fake = createFakeTransport(file, { totalChunksOverride: 2 });
    const storage = createMemoryStorage();

    const result = await uploadFileChunkedWithResume(
      baseOptions(file, fake, storage),
    );

    expect(result.status).toBe("paused");
    expect(result.error).toBeInstanceOf(ChunkTransportError);
    expect(storage.dump()).toBeNull();
  });

  it("rejects empty files", async () => {
    const file = makeFile(0);
    const fake = createFakeTransport(file);
    const storage = createMemoryStorage();

    const result = await uploadFileChunkedWithResume(
      baseOptions(file, fake, storage),
    );

    expect(result.status).toBe("paused");
    expect(fake.createSession).not.toHaveBeenCalled();
  });

  it("drops a resume record when the signed session is invalid", async () => {
    const file = makeFile(150);
    const fake = createFakeTransport(file);
    const storage = createMemoryStorage();
    fake.transport.uploadChunk = vi.fn(async () => {
      throw new ChunkTransportError("上传会话已过期", {
        code: "UPLOAD_SESSION_EXPIRED",
        status: 400,
        retryable: false,
      });
    });

    const result = await uploadFileChunkedWithResume({
      ...baseOptions(file, fake, storage),
      concurrency: 1,
    });

    expect(result.status).toBe("paused");
    expect(result.resumeRecord).toBeNull();
    expect(storage.dump()).toBeNull();
  });

  it("discards a stored resume record", async () => {
    const file = makeFile(250);
    const fake = createFakeTransport(file);
    const storage = createMemoryStorage();
    fake.failChunks.add(0);

    await uploadFileChunkedWithResume({
      ...baseOptions(file, fake, storage),
      concurrency: 1,
    });
    expect(storage.dump()).not.toBeNull();
    expect(
      findResumableUpload({
        roomCode: "ROOM01",
        file,
        resumeStorage: storage,
        now: NOW,
      })?.completedChunks,
    ).toEqual([]);

    discardChunkedUpload({
      roomCode: "ROOM01",
      file,
      resumeStorage: storage,
    });

    expect(storage.dump()).toBeNull();
  });
});
