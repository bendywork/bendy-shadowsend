import { describe, expect, it } from "vitest";

import { UPLOAD_CHUNK_SIZE_BYTES } from "@/lib/upload/constants";
import { buildUploadManifest, expectedChunkBytes } from "@/lib/upload/manifest";
import { createUploadSession } from "@/lib/upload/session";

const chunk = UPLOAD_CHUNK_SIZE_BYTES;

function hashOf(char: string) {
  return char.repeat(64);
}

function buildSession(sizeBytes: number) {
  return createUploadSession({
    roomId: "room-1",
    userId: "user-1",
    service: "pic-sl",
    fileName: "archive.zip",
    mimeType: "application/zip",
    sizeBytes,
  });
}

describe("buildUploadManifest", () => {
  it("builds an ordered manifest for a complete upload", () => {
    const session = buildSession(chunk * 2 + 10);
    const manifest = buildUploadManifest(session, [
      { index: 0, url: "https://pic.sl.al/f/pic/2026-10-18/a", sizeBytes: chunk, sha256: hashOf("a") },
      { index: 1, url: "https://pic.sl.al/f/pic/2026-10-18/b", sizeBytes: chunk, sha256: hashOf("b") },
      { index: 2, url: "https://pic.sl.al/f/pic/2026-10-18/c", sizeBytes: 10, sha256: hashOf("c") },
    ]);

    expect(manifest.uploadId).toBe(session.sid);
    expect(manifest.totalChunks).toBe(3);
    expect(manifest.chunks.map((item) => item.index)).toEqual([0, 1, 2]);
    expect(manifest.chunks.map((item) => item.sha256)).toEqual([
      hashOf("a"),
      hashOf("b"),
      hashOf("c"),
    ]);
    expect(manifest.sizeBytes).toBe(chunk * 2 + 10);
  });

  it("rejects missing, reordered, and oversized chunks", () => {
    const session = buildSession(chunk + 10);
    const url = "https://pic.sl.al/f/pic/2026-10-18/a";

    expect(() => buildUploadManifest(session, [])).toThrowError(/分片数量不匹配/);
    expect(() =>
      buildUploadManifest(session, [
        { index: 1, url, sizeBytes: 10 },
        { index: 0, url, sizeBytes: chunk },
      ]),
    ).toThrowError(/分片顺序或数量不完整/);
    expect(() =>
      buildUploadManifest(session, [
        { index: 0, url, sizeBytes: chunk + 1 },
        { index: 1, url, sizeBytes: 10 },
      ]),
    ).toThrowError(/分片大小与上传会话不一致/);
  });

  it("rejects URLs outside the selected service", () => {
    const session = buildSession(chunk);

    expect(() =>
      buildUploadManifest(session, [
        { index: 0, url: "https://evil.example.com/a", sizeBytes: chunk },
      ]),
    ).toThrowError(/分片地址不受信任/);
    expect(() =>
      buildUploadManifest(session, [
        { index: 0, url: "https://file.icve.com.cn/a", sizeBytes: chunk },
      ]),
    ).toThrowError(/分片地址不受信任/);
  });

  it("computes the expected size for each index", () => {
    const session = buildSession(chunk + 10);

    expect(expectedChunkBytes(session, 0)).toBe(chunk);
    expect(expectedChunkBytes(session, 1)).toBe(10);
    expect(() => expectedChunkBytes(session, 2)).toThrowError(/超出范围/);
  });

  it("requires a valid SHA-256 for every chunk", () => {
    const session = buildSession(chunk);
    const url = "https://pic.sl.al/f/pic/2026-10-18/a";

    expect(() =>
      buildUploadManifest(session, [{ index: 0, url, sizeBytes: chunk }]),
    ).toThrowError(/SHA-256/);

    expect(() =>
      buildUploadManifest(session, [
        { index: 0, url, sizeBytes: chunk, sha256: "not-a-hash" },
      ]),
    ).toThrowError(/SHA-256/);

    const manifest = buildUploadManifest(session, [
      {
        index: 0,
        url,
        sizeBytes: chunk,
        sha256: hashOf("A").toUpperCase(),
      },
    ]);
    expect(manifest.chunks[0].sha256).toBe(hashOf("a"));
  });
});
