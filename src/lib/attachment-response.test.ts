import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createRemoteAttachmentResponse, parseByteRange } from "@/lib/attachment-response";
import { UPLOAD_CHUNK_BYTES } from "@/lib/attachment-storage";

const base = {
  s3Key: "https://s3v2.lamen.top/test.txt", storage: "REMOTE", fileName: "下载'文件.txt",
  mimeType: "text/plain", sizeBytes: 5,
};
const first = new Uint8Array(UPLOAD_CHUNK_BYTES).fill(97);
const second = new Uint8Array(4 * 1024 * 1024).fill(98);
const hash = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");
const chunked = {
  ...base, sizeBytes: first.length + second.length,
  chunkManifest: {
    version: 1, chunkSize: UPLOAD_CHUNK_BYTES, sizeBytes: first.length + second.length,
    chunks: [
      { index: 0, url: base.s3Key, sizeBytes: first.length, sha256: hash(first) },
      { index: 1, url: `${base.s3Key}-1`, sizeBytes: second.length, sha256: hash(second) },
    ],
  },
};

describe("attachment byte ranges", () => {
  it.each([
    ["bytes=1-3", { start: 1, end: 3, partial: true }],
    ["bytes=2-", { start: 2, end: 4, partial: true }],
    ["bytes=-2", { start: 3, end: 4, partial: true }],
    ["bytes=0-99", { start: 0, end: 4, partial: true }],
  ])("parses %s", (header, expected) => expect(parseByteRange(header as string, 5)).toEqual(expected));

  it.each(["bytes=5-", "bytes=3-2", "bytes=-0", "bytes=0-1,3-4", "bytes=-", "items=0-2"])("rejects %s", (header) => {
    expect(parseByteRange(header, 5)).toBeNull();
  });
});

describe("remote download and merge", () => {
  it("sets the original filename and checks single-file size", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response("hello", { headers: { "content-length": "5" } }));
    const response = await createRemoteAttachmentResponse(base, { disposition: "attachment", fetchImpl });
    expect(await response.text()).toBe("hello");
    expect(response.headers.get("content-length")).toBe("5");
    expect(response.headers.get("content-disposition")).toContain("%27");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(fetchImpl.mock.calls[0][1]?.headers).toEqual({ "Accept-Encoding": "identity" });
  });

  it("supports single-file video seeking with a 206 response", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response("hello"));
    const response = await createRemoteAttachmentResponse(base, { disposition: "inline", range: "bytes=1-3", fetchImpl });
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 1-3/5");
    expect(await response.text()).toBe("ell");
    expect(response.headers.get("content-security-policy")).toContain("sandbox");
  });

  it("returns 416 without fetching for an invalid range", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const response = await createRemoteAttachmentResponse(base, { disposition: "attachment", range: "bytes=9-", fetchImpl });
    expect(response.status).toBe(416);
    expect(response.headers.get("content-range")).toBe("bytes */5");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("merges a range across chunk boundaries with SHA-256 validation", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(first))
      .mockResolvedValueOnce(new Response(second));
    const response = await createRemoteAttachmentResponse(chunked, {
      disposition: "attachment", range: `bytes=${first.length - 2}-${first.length + 2}`, fetchImpl,
    });
    expect(await response.text()).toBe("aabbb");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("fetches only the requested chunk for a suffix range", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(second));
    const response = await createRemoteAttachmentResponse(chunked, { disposition: "inline", range: "bytes=-3", fetchImpl });
    expect(await response.text()).toBe("bbb");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe(`${base.s3Key}-1`);
  });

  it("does not fetch the entire file ahead of consumer demand and cancels upstream", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(first));
    const response = await createRemoteAttachmentResponse(chunked, { disposition: "attachment", fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const signal = fetchImpl.mock.calls[0][1]?.signal;
    await response.body!.cancel();
    expect(signal?.aborted).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("blocks a redirect to a private or unrelated host before following it", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, {
      status: 302, headers: { location: "http://127.0.0.1:5432/" },
    }));
    await expect(createRemoteAttachmentResponse(base, { disposition: "attachment", fetchImpl }))
      .rejects.toMatchObject({ code: "ATTACHMENT_REDIRECT_INVALID" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("follows a validated redirect without forwarding credentials", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "https://s3v2.haikouer.top/file.txt" } }))
      .mockResolvedValueOnce(new Response("hello"));
    const response = await createRemoteAttachmentResponse(base, { disposition: "attachment", fetchImpl });
    expect(await response.text()).toBe("hello");
    expect(fetchImpl.mock.calls[1][0]).toBe("https://s3v2.haikouer.top/file.txt");
  });

  it.each(["hell", "hello!"])("rejects truncated or oversized bytes (%s)", async (content) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(content));
    await expect(createRemoteAttachmentResponse(base, { disposition: "attachment", fetchImpl }))
      .rejects.toMatchObject({ code: "ATTACHMENT_SIZE_MISMATCH" });
  });

  it("rejects a wrong content-length before streaming", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response("hello", { headers: { "content-length": "6" } }));
    await expect(createRemoteAttachmentResponse(base, { disposition: "attachment", fetchImpl }))
      .rejects.toMatchObject({ code: "ATTACHMENT_SIZE_MISMATCH" });
  });

  it("rejects a corrupt first chunk before sending success headers", async () => {
    const bad = { ...chunked, chunkManifest: { ...chunked.chunkManifest, chunks: [
      { ...chunked.chunkManifest.chunks[0], sha256: "0".repeat(64) }, chunked.chunkManifest.chunks[1],
    ] } };
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(first));
    await expect(createRemoteAttachmentResponse(bad, { disposition: "attachment", fetchImpl }))
      .rejects.toMatchObject({ code: "ATTACHMENT_HASH_MISMATCH" });
  });

  it("terminates the stream when a later chunk is missing", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(first))
      .mockResolvedValueOnce(new Response("missing", { status: 404 }));
    const response = await createRemoteAttachmentResponse(chunked, { disposition: "attachment", fetchImpl });
    await expect(response.arrayBuffer()).rejects.toMatchObject({ code: "ATTACHMENT_FETCH_FAILED" });
  });

  it("returns an explicit retired-storage error and never contacts an old provider", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(createRemoteAttachmentResponse({ ...base, storage: "S3" }, { disposition: "attachment", fetchImpl }))
      .rejects.toMatchObject({ status: 410, code: "ATTACHMENT_STORAGE_RETIRED" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
