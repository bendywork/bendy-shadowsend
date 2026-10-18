import { afterEach, describe, expect, it, vi } from "vitest";

import { createMergedRemoteStream } from "@/lib/upload/remote-stream";
import type { UploadManifest } from "@/lib/upload/types";

const manifest: UploadManifest = {
  uploadId: "upload-1",
  service: "pic-sl",
  storage: "PIC_SL",
  fileName: "report.bin",
  mimeType: "application/octet-stream",
  sizeBytes: 6,
  chunkSize: 3,
  totalChunks: 2,
  chunks: [
    { index: 0, url: "https://pic.sl.al/f/part-0", sizeBytes: 3 },
    { index: 1, url: "https://pic.sl.al/f/part-1", sizeBytes: 3 },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createMergedRemoteStream", () => {
  it("concatenates remote chunks in manifest order", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      return new Response(url.endsWith("part-0") ? "abc" : "def", {
        status: 200,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const stream = createMergedRemoteStream(manifest);
    const response = new Response(stream);
    const text = await response.text();

    expect(text).toBe("abcdef");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://pic.sl.al/f/part-0");
    expect(String(fetchMock.mock.calls[1][0])).toBe("https://pic.sl.al/f/part-1");
  });

  it("fails the stream when a chunk URL is outside the allow-list", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const stream = createMergedRemoteStream({
      ...manifest,
      chunks: [
        { index: 0, url: "https://evil.example/part-0", sizeBytes: 3 },
        { index: 1, url: "https://pic.sl.al/f/part-1", sizeBytes: 3 },
      ],
    });

    await expect(new Response(stream).text()).rejects.toThrow(
      "远端分片地址无效",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails when a chunk cannot be downloaded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 502 })),
    );

    const stream = createMergedRemoteStream(manifest);

    await expect(new Response(stream).text()).rejects.toThrow(
      "远端分片下载失败",
    );
  });
});
