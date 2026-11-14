import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_ATTACHMENT_SIZE_BYTES } from "@/lib/constants";
import { SINGLE_UPLOAD_BYTES, UPLOAD_CHUNK_BYTES, UPLOAD_URL } from "@/lib/attachment-storage";

class MockXHR {
  static requests: MockXHR[] = [];
  static inFlight = new Set<MockXHR>();
  static maxActive = 0;
  static behavior: (xhr: MockXHR) => void;
  method = "";
  url = "";
  body!: FormData;
  headers: Array<[string, string]> = [];
  status = 0;
  responseText = "";
  withCredentials = true;
  timeout = 0;
  responseType = "";
  upload: { onprogress?: (event: { lengthComputable: boolean; loaded: number; total: number }) => void } = {};
  onload?: () => void;
  onerror?: () => void;
  ontimeout?: () => void;
  onabort?: () => void;
  open(method: string, url: string) { this.method = method; this.url = url; }
  setRequestHeader(name: string, value: string) { this.headers.push([name, value]); }
  send(body: FormData) {
    this.body = body;
    MockXHR.requests.push(this);
    MockXHR.inFlight.add(this);
    MockXHR.maxActive = Math.max(MockXHR.maxActive, MockXHR.inFlight.size);
    queueMicrotask(() => MockXHR.behavior(this));
  }
  complete(text?: string, status = 200) {
    this.responseText = text ?? `https://s3v2.lamen.top/files/${encodeURIComponent((this.body.get("file") as File).name)}`;
    this.status = status;
    MockXHR.inFlight.delete(this);
    this.onload?.();
  }
  abort() { MockXHR.inFlight.delete(this); this.onabort?.(); }
}

let client: typeof import("@/lib/upload-client");
beforeEach(async () => {
  vi.resetModules();
  MockXHR.requests = [];
  MockXHR.inFlight = new Set();
  MockXHR.maxActive = 0;
  MockXHR.behavior = (xhr) => xhr.complete();
  vi.stubGlobal("XMLHttpRequest", MockXHR);
  client = await import("@/lib/upload-client");
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("direct unified uploads", () => {
  it.each(["image/png", "video/mp4", "audio/webm", "application/pdf", "application/zip", ""])("uploads %s with a single file field and no credentials", async (type) => {
    const file = new File(["file bytes"], "original.name.bin", { type });
    const uploaded = await client.uploadFile(file);
    const xhr = MockXHR.requests[0];
    expect(xhr.method).toBe("POST");
    expect(xhr.url).toBe(UPLOAD_URL);
    expect(xhr.withCredentials).toBe(false);
    expect(xhr.headers).toEqual([]);
    expect(xhr.timeout).toBe(90_000);
    expect(Array.from(xhr.body.keys())).toEqual(["file"]);
    expect((xhr.body.get("file") as File).name).toBe(file.name);
    expect(uploaded.storage).toBe("REMOTE");
    expect(uploaded.mimeType).toBe(type || "application/octet-stream");
  });

  it("trims a plain URL and reports completion only after validation", async () => {
    MockXHR.behavior = (xhr) => {
      xhr.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 });
      xhr.complete("\n https://s3v2.haikouer.top/image.png \n");
    };
    const progress: number[] = [];
    const result = await client.uploadFile(new File(["data"], "image.png", { type: "image/png" }), { onProgress: (value) => progress.push(value) });
    expect(result.s3Key).toBe("https://s3v2.haikouer.top/image.png");
    expect(result.previewUrl).toBe(result.s3Key);
    expect(progress).toEqual([0, 50, 100]);
  });

  it.each(['{"url":"https://s3v2.lamen.top/file"}', "https://evil.test/file", ""])("rejects malformed/plaintext contract violations %s", async (response) => {
    MockXHR.behavior = (xhr) => xhr.complete(response);
    await expect(client.uploadFile(new File(["data"], "data.bin"))).rejects.toMatchObject({ code: "UPLOAD_INVALID_RESPONSE" });
    expect(MockXHR.requests).toHaveLength(1);
  });

  it("retries the same endpoint with bounded exponential backoff", async () => {
    vi.useFakeTimers();
    const timers = vi.spyOn(globalThis, "setTimeout");
    MockXHR.behavior = (xhr) => xhr.complete(undefined, MockXHR.requests.length < 3 ? 503 : 200);
    const task = client.uploadFile(new File(["data"], "data.bin"));
    await vi.runAllTimersAsync();
    expect((await task).storage).toBe("REMOTE");
    expect(MockXHR.requests.map((xhr) => xhr.url)).toEqual([UPLOAD_URL, UPLOAD_URL, UPLOAD_URL]);
    expect(timers.mock.calls.map((call) => call[1]).filter((ms) => ms === 400 || ms === 800)).toEqual([400, 800]);
  });

  it("stops after three retryable failures", async () => {
    vi.useFakeTimers();
    MockXHR.behavior = (xhr) => xhr.complete("unavailable", 500);
    const check = expect(client.uploadFile(new File(["data"], "data.bin"))).rejects.toMatchObject({ code: "UPLOAD_HTTP_ERROR" });
    await vi.runAllTimersAsync();
    await check;
    expect(MockXHR.requests).toHaveLength(3);
  });

  it("does not retry a rejected permission request or use another provider", async () => {
    MockXHR.behavior = (xhr) => xhr.complete("forbidden", 403);
    await expect(client.uploadFile(new File(["data"], "data.bin"))).rejects.toMatchObject({ status: 403, retryable: false });
    expect(MockXHR.requests).toHaveLength(1);
  });

  it("keeps completed files when the message is sent again", async () => {
    const file = new File(["data"], "cached.bin");
    const first = await client.uploadFile(file);
    expect(await client.uploadFile(file)).toEqual(first);
    expect(MockXHR.requests).toHaveLength(1);
  });

  it("limits full-file work to three concurrent uploads", async () => {
    MockXHR.behavior = () => undefined;
    const tasks = Array.from({ length: 5 }, (_, index) => client.uploadFile(new File(["data"], `${index}.bin`)));
    expect(MockXHR.requests).toHaveLength(3);
    MockXHR.requests.slice(0, 3).forEach((xhr) => xhr.complete());
    for (let tick = 0; tick < 10; tick += 1) await Promise.resolve();
    expect(MockXHR.requests).toHaveLength(5);
    MockXHR.requests.slice(3).forEach((xhr) => xhr.complete());
    await Promise.all(tasks);
    expect(MockXHR.maxActive).toBeLessThanOrEqual(3);
  });

  it("cancels a queued upload without leaking a concurrency slot", async () => {
    MockXHR.behavior = () => undefined;
    const active = Array.from({ length: 3 }, (_, index) => client.uploadFile(new File(["data"], `active-${index}.bin`)));
    const controller = new AbortController();
    const cancelled = expect(client.uploadFile(new File(["data"], "queued.bin"), { signal: controller.signal })).rejects.toMatchObject({ code: "UPLOAD_ABORTED" });
    controller.abort();
    await cancelled;
    MockXHR.requests.forEach((xhr) => xhr.complete());
    await Promise.all(active);
    MockXHR.behavior = (xhr) => xhr.complete();
    expect((await client.uploadFile(new File(["data"], "next.bin"))).storage).toBe("REMOTE");
    expect(MockXHR.maxActive).toBeLessThanOrEqual(3);
  });

  it("aborts an active request", async () => {
    MockXHR.behavior = () => undefined;
    const controller = new AbortController();
    const task = client.uploadFile(new File(["data"], "abort.bin"), { signal: controller.signal });
    controller.abort();
    await expect(task).rejects.toMatchObject({ code: "UPLOAD_ABORTED" });
  });

  it("rejects empty, oversized or invalid-name files before contacting the provider", async () => {
    const oversized = new File(["data"], "too-large.bin");
    Object.defineProperty(oversized, "size", { value: MAX_ATTACHMENT_SIZE_BYTES + 1 });
    for (const file of [new File([], "empty.bin"), oversized, new File(["data"], "bad/name.bin")]) {
      await expect(client.uploadFile(file)).rejects.toBeInstanceOf(client.UploadError);
    }
    expect(MockXHR.requests).toHaveLength(0);
  });
});

describe("application chunk uploads", () => {
  it("sends each part to the same API, preserving the extension and recording its hash", async () => {
    const bytes = new Uint8Array(SINGLE_UPLOAD_BYTES + 1).fill(42);
    const file = new File([bytes], "archive.original.zip", { type: "application/zip" });
    const result = await client.uploadFile(file);
    expect(MockXHR.requests).toHaveLength(2);
    expect(MockXHR.requests.map((xhr) => (xhr.body.get("file") as File).name)).toEqual(["0-archive.original.zip", "1-archive.original.zip"]);
    expect(MockXHR.requests.map((xhr) => xhr.url)).toEqual([UPLOAD_URL, UPLOAD_URL]);
    expect(result.chunkManifest?.chunks[0].sizeBytes).toBe(UPLOAD_CHUNK_BYTES);
    expect(result.chunkManifest?.chunks[1].sizeBytes).toBe(bytes.length - UPLOAD_CHUNK_BYTES);
    expect(result.chunkManifest?.chunks[0].sha256).toBe(createHash("sha256").update(bytes.subarray(0, UPLOAD_CHUNK_BYTES)).digest("hex"));
    expect(result.s3Key).toBe(result.chunkManifest?.chunks[0].url);
  });

  it("reuses completed chunks after a failed later part", async () => {
    const file = new File([new Uint8Array(SINGLE_UPLOAD_BYTES + 1)], "resume.mp4", { type: "video/mp4" });
    MockXHR.behavior = (xhr) => xhr.complete(undefined, MockXHR.requests.length === 2 ? 403 : 200);
    await expect(client.uploadFile(file)).rejects.toMatchObject({ status: 403 });
    const result = await client.uploadFile(file);
    expect(MockXHR.requests).toHaveLength(3);
    expect((MockXHR.requests[2].body.get("file") as File).name).toBe("1-resume.mp4");
    expect(result.chunkManifest?.chunks).toHaveLength(2);
  });
});
