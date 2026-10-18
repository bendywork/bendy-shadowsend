import { describe, expect, it, vi } from "vitest";

import {
  ChunkTransportError,
  createRelayChunkTransport,
  type UploadSessionInfo,
} from "@/lib/upload/chunk-transport";

const SESSION_DATA: UploadSessionInfo = {
  session: "signed-session",
  service: "pic-sl",
  storage: "PIC_SL",
  chunkSize: 100,
  totalChunks: 3,
  lastChunkBytes: 50,
  expiresAt: 1_700_007_200_000,
};

const MANIFEST_DATA = {
  uploadId: "upload-1",
  service: "pic-sl",
  storage: "PIC_SL",
  fileName: "video.mp4",
  mimeType: "video/mp4",
  sizeBytes: 250,
  chunkSize: 100,
  totalChunks: 3,
  chunks: [
    { index: 0, url: "https://pic.sl.al/a", sizeBytes: 100 },
    { index: 1, url: "https://pic.sl.al/b", sizeBytes: 100 },
    { index: 2, url: "https://pic.sl.al/c", sizeBytes: 50 },
  ],
  mergeToken: "merge-token",
  mergeUrl: "/api/rooms/ROOM01/merge",
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ ok: true, data }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function errorResponse(
  status: number,
  message: string,
  code: string,
): Response {
  return new Response(JSON.stringify({ ok: false, error: { message, code } }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function makeFile(): File {
  return new File([new Uint8Array(250)], "video.mp4", {
    type: "video/mp4",
    lastModified: 123,
  });
}

type FakeXhr = {
  upload: { onprogress: ((event: ProgressEvent) => void) | null };
  status: number;
  responseText: string;
  withCredentials: boolean;
  open: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  abort: ReturnType<typeof vi.fn>;
  onload: (() => void) | null;
  onerror: (() => void) | null;
  onabort: (() => void) | null;
};

function createFakeXhr(body: unknown, status = 200): FakeXhr {
  const xhr: FakeXhr = {
    upload: { onprogress: null },
    status,
    responseText: JSON.stringify(body),
    withCredentials: false,
    open: vi.fn(),
    send: vi.fn(() => {
      queueMicrotask(() => {
        xhr.upload.onprogress?.({
          lengthComputable: true,
          loaded: 42,
        } as ProgressEvent);
        xhr.onload?.();
      });
    }),
    abort: vi.fn(() => {
      xhr.onabort?.();
    }),
    onload: null,
    onerror: null,
    onabort: null,
  };
  return xhr;
}

describe("createRelayChunkTransport", () => {
  it("creates a session through the JSON endpoint", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(SESSION_DATA));

    const transport = createRelayChunkTransport("ROOM01", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const info = await transport.createSession(makeFile());

    expect(info).toEqual(SESSION_DATA);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/rooms/ROOM01/upload/sessions");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      fileName: "video.mp4",
      mimeType: "video/mp4",
      sizeBytes: 250,
    });
  });

  it("surfaces retryable server errors", async () => {
    const fetchImpl = vi.fn(async () =>
      errorResponse(429, "请求过于频繁", "RATE_LIMITED"),
    );
    const transport = createRelayChunkTransport("ROOM01", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(transport.createSession(makeFile())).rejects.toMatchObject({
      name: "ChunkTransportError",
      code: "RATE_LIMITED",
      status: 429,
      retryable: true,
    });
  });

  it("rejects session responses with mismatched storage", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ ...SESSION_DATA, storage: "SANG" }),
    );
    const transport = createRelayChunkTransport("ROOM01", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(transport.createSession(makeFile())).rejects.toMatchObject({
      code: "UPLOAD_RESPONSE_INVALID",
      retryable: false,
    });
  });

  it("uploads a chunk with progress through XHR", async () => {
    const xhr = createFakeXhr({
      ok: true,
      data: { index: 1, url: "https://pic.sl.al/b", sizeBytes: 100 },
    });
    const transport = createRelayChunkTransport("ROOM01", {
      xhrFactory: () => xhr as unknown as XMLHttpRequest,
    });
    const progress = vi.fn();

    const descriptor = await transport.uploadChunk({
      session: "signed-session",
      index: 1,
      blob: new Blob([new Uint8Array(100)]),
      onProgress: progress,
    });

    expect(descriptor).toEqual({
      index: 1,
      url: "https://pic.sl.al/b",
      sizeBytes: 100,
    });
    expect(progress).toHaveBeenCalledWith(42);
    expect(xhr.open).toHaveBeenCalledWith(
      "POST",
      "/api/rooms/ROOM01/upload/sessions/chunk",
      true,
    );

    const formData = xhr.send.mock.calls[0][0] as FormData;
    expect(formData.get("session")).toBe("signed-session");
    expect(formData.get("chunkIndex")).toBe("1");
    expect(formData.get("file")).toBeInstanceOf(File);
  });

  it("marks 5xx chunk errors as retryable", async () => {
    const xhr = createFakeXhr(
      { ok: false, error: { message: "上游失败", code: "REMOTE_FAILED" } },
      503,
    );
    const transport = createRelayChunkTransport("ROOM01", {
      xhrFactory: () => xhr as unknown as XMLHttpRequest,
    });

    await expect(
      transport.uploadChunk({
        session: "signed-session",
        index: 0,
        blob: new Blob([new Uint8Array(100)]),
      }),
    ).rejects.toMatchObject({
      code: "REMOTE_FAILED",
      status: 503,
      retryable: true,
    });
  });

  it("aborts an in-flight chunk when the signal fires", async () => {
    const xhr = createFakeXhr({ ok: true, data: {} });
    xhr.send = vi.fn();
    const transport = createRelayChunkTransport("ROOM01", {
      xhrFactory: () => xhr as unknown as XMLHttpRequest,
    });
    const controller = new AbortController();
    controller.abort();

    await expect(
      transport.uploadChunk({
        session: "signed-session",
        index: 0,
        blob: new Blob([new Uint8Array(100)]),
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: "UPLOAD_ABORTED" });
  });

  it("completes the session and validates the manifest", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(MANIFEST_DATA));
    const transport = createRelayChunkTransport("ROOM01", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const completed = await transport.completeSession({
      session: "signed-session",
      chunks: MANIFEST_DATA.chunks,
    });

    expect(completed.mergeToken).toBe("merge-token");
    expect(completed.chunks.map((chunk) => chunk.index)).toEqual([0, 1, 2]);

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/rooms/ROOM01/upload/sessions/complete");
    expect(JSON.parse(String(init.body))).toEqual({
      session: "signed-session",
      chunks: MANIFEST_DATA.chunks,
    });
  });

  it("rejects incomplete manifests", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ ...MANIFEST_DATA, chunks: MANIFEST_DATA.chunks.slice(0, 2) }),
    );
    const transport = createRelayChunkTransport("ROOM01", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(
      transport.completeSession({
        session: "signed-session",
        chunks: MANIFEST_DATA.chunks,
      }),
    ).rejects.toMatchObject({ code: "UPLOAD_RESPONSE_INVALID" });
  });

  it("wraps network failures as retryable transport errors", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const transport = createRelayChunkTransport("ROOM01", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(transport.createSession(makeFile())).rejects.toBeInstanceOf(
      ChunkTransportError,
    );
    await expect(transport.createSession(makeFile())).rejects.toMatchObject({
      code: "UPLOAD_NETWORK_ERROR",
      retryable: true,
    });
  });
});
