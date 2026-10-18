import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  isRetryableUploadStatus,
  uploadFileViaRelay,
  type UploadClientMessages,
} from "@/lib/upload/client";

const messages: UploadClientMessages = {
  networkError: "网络异常",
  timeout: "上传超时",
  invalidResponse: "上传服务返回异常",
  uploadFailed: (name) => `上传失败：${name}`,
};

type FakeProgressEvent = {
  lengthComputable: boolean;
  loaded: number;
  total: number;
};

class FakeXHR {
  static instances: FakeXHR[] = [];

  upload = {
    onprogress: null as ((event: FakeProgressEvent) => void) | null,
  };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;
  status = 200;
  responseText = "";
  withCredentials = false;
  method = "";
  url = "";
  headers: Record<string, string> = {};
  body: unknown;

  constructor() {
    FakeXHR.instances.push(this);
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(key: string, value: string) {
    this.headers[key] = value;
  }

  send(body: unknown) {
    this.body = body;
  }

  respond(status: number, payload: unknown) {
    this.status = status;
    this.responseText = JSON.stringify(payload);
    queueMicrotask(() => this.onload?.());
  }

  failNetwork() {
    queueMicrotask(() => this.onerror?.());
  }
}

const originalXhr = globalThis.XMLHttpRequest;

beforeEach(() => {
  FakeXHR.instances = [];
  globalThis.XMLHttpRequest = FakeXHR as unknown as typeof XMLHttpRequest;
});

afterEach(() => {
  globalThis.XMLHttpRequest = originalXhr;
  vi.unstubAllGlobals();
});

function fileOf(content: string, name: string, type: string): File {
  return new File([content], name, { type });
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("isRetryableUploadStatus", () => {
  it("marks transient statuses as retryable", () => {
    for (const status of [408, 409, 429, 500, 502, 503, 504, 520, 522, 524]) {
      expect(isRetryableUploadStatus(status)).toBe(true);
    }
  });

  it("does not retry client and validation errors", () => {
    for (const status of [400, 401, 403, 404, 413, 415, 422]) {
      expect(isRetryableUploadStatus(status)).toBe(false);
    }
  });
});

describe("uploadFileViaRelay", () => {
  it("uploads a small file through the single-request relay route", async () => {
    const file = fileOf("hello", "photo.png", "image/png");

    const promise = uploadFileViaRelay({
      roomCode: "room-1",
      file,
      messages,
    });

    const xhr = FakeXHR.instances[0];
    expect(xhr.url).toBe("/api/rooms/room-1/upload/forward");
    expect(xhr.body).toBeInstanceOf(FormData);

    xhr.respond(200, {
      ok: true,
      data: {
        service: "sang",
        storage: "SANG",
        fileName: "photo.png",
        mimeType: "image/png",
        sizeBytes: 5,
        url: "https://file.sang.pub/files/photo.png",
        chunked: false,
      },
    });

    await expect(promise).resolves.toEqual({
      s3Key: "https://file.sang.pub/files/photo.png",
      fileName: "photo.png",
      mimeType: "image/png",
      sizeBytes: 5,
      storage: "SANG",
      previewUrl: "https://file.sang.pub/files/photo.png",
      chunked: false,
      chunkManifest: null,
    });
  });

  it("surfaces a non-retryable server error", async () => {
    const promise = uploadFileViaRelay({
      roomCode: "room-1",
      file: fileOf("hello", "bad.html", "text/html"),
      messages,
    });

    FakeXHR.instances[0].respond(415, {
      ok: false,
      error: { message: "该文件类型不被允许", code: "UPLOAD_EXTENSION_BLOCKED" },
    });

    await expect(promise).rejects.toMatchObject({
      code: "UPLOAD_EXTENSION_BLOCKED",
      retryable: false,
      status: 415,
      message: "该文件类型不被允许",
    });
  });

  it("marks transient server failures as retryable", async () => {
    const promise = uploadFileViaRelay({
      roomCode: "room-1",
      file: fileOf("hello", "a.txt", "text/plain"),
      messages,
    });

    FakeXHR.instances[0].respond(503, {
      ok: false,
      error: { message: "服务暂不可用", code: "UPLOAD_REMOTE_ERROR" },
    });

    await expect(promise).rejects.toMatchObject({
      retryable: true,
      status: 503,
    });
  });

  it("marks network failures as retryable", async () => {
    const promise = uploadFileViaRelay({
      roomCode: "room-1",
      file: fileOf("hello", "a.txt", "text/plain"),
      messages,
    });

    FakeXHR.instances[0].failNetwork();

    await expect(promise).rejects.toMatchObject({
      code: "UPLOAD_NETWORK_ERROR",
      retryable: true,
      message: "网络异常",
    });
  });

  it("uses the session contract for files above the single-request limit", async () => {
    const chunkSize = 4 * 1024 * 1024;
    const file = new File([new Uint8Array(chunkSize + 2)], "report.pdf", {
      type: "application/pdf",
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/upload/sessions")) {
        return new Response(
          JSON.stringify({
            ok: true,
            data: {
              session: "signed-session",
              service: "pic-sl",
              storage: "PIC_SL",
              chunkSize,
              totalChunks: 2,
              lastChunkBytes: 2,
              expiresAt: Date.now() + 60_000,
            },
          }),
          { status: 200 },
        );
      }

      return new Response(
        JSON.stringify({
          ok: true,
          data: {
            uploadId: "upload-1",
            service: "pic-sl",
            storage: "PIC_SL",
            fileName: "report.pdf",
            mimeType: "application/pdf",
            sizeBytes: chunkSize + 2,
            chunkSize,
            totalChunks: 2,
            chunks: [
              { index: 0, url: "https://pic.sl.al/f/part-0", sizeBytes: chunkSize },
              { index: 1, url: "https://pic.sl.al/f/part-1", sizeBytes: 2 },
            ],
          },
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const progress: number[] = [];
    const promise = uploadFileViaRelay({
      roomCode: "room-1",
      file,
      messages,
      onProgress: (percent) => progress.push(percent),
    });

    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(FakeXHR.instances).toHaveLength(1);

    FakeXHR.instances[0].respond(200, {
      ok: true,
      data: { index: 0, url: "https://pic.sl.al/f/part-0", sizeBytes: chunkSize },
    });

    await flush();
    expect(FakeXHR.instances).toHaveLength(2);

    FakeXHR.instances[1].respond(200, {
      ok: true,
      data: { index: 1, url: "https://pic.sl.al/f/part-1", sizeBytes: 2 },
    });

    const result = await promise;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.storage).toBe("PIC_SL");
    expect(result.chunked).toBe(true);
    expect(result.previewUrl).toBeNull();
    expect(result.chunkManifest?.chunks).toHaveLength(2);
    expect(result.s3Key).toBe("https://pic.sl.al/f/part-0");
    expect(progress.at(-1)).toBe(100);
  });
});
