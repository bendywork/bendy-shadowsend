import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  PIC_SL_MAX_BYTES,
  UPLOAD_CHUNK_SIZE_BYTES,
} from "@/lib/upload/constants";
import {
  MergeDownloadError,
  assertMergeManifest,
  buildContentDisposition,
  buildMergeUrl,
  openMergedStream,
  signMergeToken,
  verifyMergeToken,
  verifyMergedManifest,
} from "@/lib/upload/merge";
import type { UploadManifest } from "@/lib/upload/types";

const secret = "merge-test-secret-0123456789";
const chunk = UPLOAD_CHUNK_SIZE_BYTES;

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function makeManifest(overrides: Partial<UploadManifest> = {}): UploadManifest {
  return {
    uploadId: "upload-1",
    service: "pic-sl",
    storage: "PIC_SL",
    fileName: "报告 2026.pdf",
    mimeType: "application/pdf",
    sizeBytes: chunk + 5,
    chunkSize: chunk,
    totalChunks: 2,
    chunks: [
      { index: 0, url: "https://pic.sl.al/f/pic/2026-10-18/a", sizeBytes: chunk },
      { index: 1, url: "https://pic.sl.al/f/pic/2026-10-18/b", sizeBytes: 5 },
    ],
    ...overrides,
  };
}

function makeSizedManifest(
  service: UploadManifest["service"],
  sizeBytes: number,
): UploadManifest {
  const totalChunks = Math.ceil(sizeBytes / chunk);
  const storage = service === "sang" ? "SANG" : "PIC_SL";
  const host = service === "sang" ? "file.sang.pub" : "pic.sl.al";

  return {
    uploadId: "upload-sized",
    service,
    storage,
    fileName: service === "sang" ? "photo.jpg" : "archive.zip",
    mimeType: service === "sang" ? "image/jpeg" : "application/zip",
    sizeBytes,
    chunkSize: chunk,
    totalChunks,
    chunks: Array.from({ length: totalChunks }, (_, index) => ({
      index,
      url: `https://${host}/f/pic/2026-10-18/chunk-${index}`,
      sizeBytes:
        index === totalChunks - 1
          ? sizeBytes - (totalChunks - 1) * chunk
          : chunk,
    })),
  };
}

function makeLargeManifest(): UploadManifest {
  const totalChunks = PIC_SL_MAX_BYTES / chunk;
  return {
    uploadId: "upload-large",
    service: "pic-sl",
    storage: "PIC_SL",
    fileName: "archive.zip",
    mimeType: "application/zip",
    sizeBytes: PIC_SL_MAX_BYTES,
    chunkSize: chunk,
    totalChunks,
    chunks: Array.from({ length: totalChunks }, (_, index) => ({
      index,
      url: `https://pic.sl.al/f/pic/2026-10-18/chunk-${String(index).padStart(3, "0")}`,
      sizeBytes: chunk,
    })),
  };
}

function makeSingleChunkManifest(): UploadManifest {
  return {
    uploadId: "upload-single",
    service: "pic-sl",
    storage: "PIC_SL",
    fileName: "note.txt",
    mimeType: "text/plain",
    sizeBytes: 5,
    chunkSize: chunk,
    totalChunks: 1,
    chunks: [{ index: 0, url: "https://pic.sl.al/f/pic/2026-10-18/a", sizeBytes: 5 }],
  };
}

function responseWith(
  body: Uint8Array[],
  init: ResponseInit = {},
): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const piece of body) {
          controller.enqueue(piece);
        }
        controller.close();
      },
    }),
    init,
  );
}

describe("merge token", () => {
  it("round-trips the room binding and manifest", () => {
    const manifest = makeManifest();
    const token = signMergeToken({ roomId: "room-1", manifest }, secret, 1000);
    const verified = verifyMergeToken(token, secret);

    expect(verified.roomId).toBe("room-1");
    expect(verified.issuedAt).toBe(1000);
    expect(verified.manifest).toEqual(manifest);
  });

  it("rejects a tampered payload and a wrong secret", () => {
    const token = signMergeToken(
      { roomId: "room-1", manifest: makeManifest() },
      secret,
    );
    const [version, body, signature] = token.split(".");
    const flipped = body[0] === "e" ? "f" : "e";
    const tampered = `${version}.${flipped}${body.slice(1)}.${signature}`;

    expect(() => verifyMergeToken(tampered, secret)).toThrowError(/签名无效/);
    expect(() => verifyMergeToken(token, `${secret}-other`)).toThrowError(/签名无效/);
  });

  it("rejects a token bound to another room when a room is expected", () => {
    const token = signMergeToken(
      { roomId: "room-1", manifest: makeManifest() },
      secret,
    );

    expect(() => verifyMergeToken(token, secret, "room-2")).toThrowError(/房间/);
    expect(verifyMergeToken(token, secret, "room-1").roomId).toBe("room-1");
  });

  it("rejects malformed and oversized tokens", () => {
    expect(() => verifyMergeToken("", secret)).toThrowError(/格式无效/);
    expect(() => verifyMergeToken("m1.only-two-parts", secret)).toThrowError(/格式无效/);
    expect(() => verifyMergeToken(`m1.${"a".repeat(20_000)}.b`, secret)).toThrowError(
      /格式无效/,
    );
  });

  it("rejects signing without a room binding", () => {
    expect(() =>
      signMergeToken({ roomId: "", manifest: makeManifest() }, secret),
    ).toThrowError(/roomId|字段/);
  });

  it("keeps a 50-chunk manifest token small enough for a URL", () => {
    const manifest = makeLargeManifest();
    const token = signMergeToken({ roomId: "room-1", manifest }, secret);

    expect(manifest.totalChunks).toBe(50);
    expect(token.length).toBeLessThan(16 * 1024);
    expect(verifyMergeToken(token, secret).manifest.chunks).toHaveLength(50);
  });
});

describe("assertMergeManifest", () => {
  it("accepts a complete manifest", () => {
    expect(() => assertMergeManifest(makeManifest())).not.toThrow();
  });

  it("rejects missing, reordered, and wrong-sized chunks", () => {
    expect(() =>
      assertMergeManifest(makeManifest({ chunks: [] })),
    ).toThrowError(/分片数量/);

    const reordered = makeManifest();
    reordered.chunks = [reordered.chunks[1], reordered.chunks[0]];
    expect(() => assertMergeManifest(reordered)).toThrowError(/顺序/);

    const wrongSize = makeManifest();
    wrongSize.chunks[0] = { ...wrongSize.chunks[0], sizeBytes: chunk - 1 };
    expect(() => assertMergeManifest(wrongSize)).toThrowError(/大小/);
  });

  it("rejects URLs outside the manifest service", () => {
    const manifest = makeManifest();
    manifest.chunks[0] = {
      ...manifest.chunks[0],
      url: "https://file.sang.pub/api/upload",
    };

    expect(() => assertMergeManifest(manifest)).toThrowError(/地址不受信任/);
  });

  it("rejects manifests beyond the service limit or with inconsistent totals", () => {
    const sangOverLimit = makeSizedManifest("sang", 100 * 1024 * 1024 + 1);
    expect(() => assertMergeManifest(sangOverLimit)).toThrowError(/上限/);

    expect(() =>
      assertMergeManifest(makeManifest({ totalChunks: 3 })),
    ).toThrowError(/分片数量/);

    expect(() =>
      assertMergeManifest(makeManifest({ sizeBytes: chunk + 6 })),
    ).toThrowError(/大小/);
  });
});

describe("buildContentDisposition", () => {
  it("emits an ASCII fallback and an RFC 5987 UTF-8 name", () => {
    const value = buildContentDisposition("报告 2026.pdf");

    expect(value).toContain('filename="__ 2026.pdf"');
    expect(value).toContain(
      "filename*=UTF-8''%E6%8A%A5%E5%91%8A%202026.pdf",
    );
  });

  it("strips header injection characters", () => {
    const value = buildContentDisposition('a\r\nX-Evil: 1".pdf');

    expect(value).not.toContain("\r");
    expect(value).not.toContain("\n");
    expect(value).toContain('filename="a__X-Evil_ 1_.pdf"');
  });
});

describe("buildMergeUrl", () => {
  it("encodes the room code and token", () => {
    expect(buildMergeUrl("room/a b", "m1.x.y")).toBe(
      "/api/rooms/room%2Fa%20b/attachments/merge?manifest=m1.x.y",
    );
  });
});

describe("openMergedStream", () => {
  it("fetches every chunk in order and concatenates the bytes", async () => {
    const manifest = makeManifest();
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      calls.push(String(input));
      if (calls.length === 1) {
        return responseWith([new Uint8Array(chunk).fill(7)], {
          headers: { "content-length": String(chunk) },
        });
      }
      return responseWith([new Uint8Array([4, 5, 6, 7, 8])], {
        headers: { "content-length": "5" },
      });
    });

    const stream = await openMergedStream(manifest, { fetchImpl });
    const merged = new Uint8Array(await new Response(stream).arrayBuffer());

    expect(calls).toEqual([
      "https://pic.sl.al/f/pic/2026-10-18/a",
      "https://pic.sl.al/f/pic/2026-10-18/b",
    ]);
    expect(merged.length).toBe(chunk + 5);
    expect(merged[0]).toBe(7);
    expect(merged[chunk - 1]).toBe(7);
    expect(Array.from(merged.slice(chunk))).toEqual([4, 5, 6, 7, 8]);
  });

  it("fails before returning a stream when the first chunk is unavailable", async () => {
    const fetchImpl = vi.fn(async () => new Response("missing", { status: 404 }));

    await expect(
      openMergedStream(makeManifest(), { fetchImpl }),
    ).rejects.toBeInstanceOf(MergeDownloadError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects a chunk whose declared length differs from the manifest", async () => {
    const fetchImpl = vi.fn(async () =>
      responseWith([new Uint8Array([1, 2, 3, 4, 5])], {
        headers: { "content-length": "4" },
      }),
    );

    await expect(
      openMergedStream(makeManifest(), { fetchImpl }),
    ).rejects.toThrowError(/长度/);
  });

  it("errors the stream when a chunk body is truncated", async () => {
    const fetchImpl = vi.fn(async () => responseWith([new Uint8Array([1, 2, 3])]));

    const stream = await openMergedStream(makeManifest(), { fetchImpl });
    await expect(new Response(stream).arrayBuffer()).rejects.toThrowError(
      /分片.*大小/,
    );
  });

  it("rejects a redirect that leaves the allowed host before following it", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(null, {
        status: 302,
        headers: { location: "https://evil.example.com/file" },
      }),
    );

    await expect(
      openMergedStream(makeSingleChunkManifest(), { fetchImpl }),
    ).rejects.toThrowError(/地址不受信任/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("follows an allowlisted redirect", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("redirect-me")) {
        return new Response(null, {
          status: 302,
          headers: { location: "https://pic.sl.al/f/pic/2026-10-18/final" },
        });
      }
      return responseWith([new Uint8Array([1, 2, 3, 4, 5])], {
        headers: { "content-length": "5" },
      });
    });
    const manifest = makeSingleChunkManifest();
    manifest.chunks[0] = {
      ...manifest.chunks[0],
      url: "https://pic.sl.al/f/pic/2026-10-18/redirect-me",
    };

    const stream = await openMergedStream(manifest, { fetchImpl });
    const merged = new Uint8Array(await new Response(stream).arrayBuffer());

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(Array.from(merged)).toEqual([1, 2, 3, 4, 5]);
  });

  it("rejects a redirect that leaves the allowed host", async () => {
    const fetchImpl = vi.fn(async () => {
      const response = responseWith([new Uint8Array([1, 2, 3, 4, 5])]);
      Object.defineProperty(response, "url", {
        value: "https://evil.example.com/file",
      });
      return response;
    });

    await expect(
      openMergedStream(makeManifest(), { fetchImpl }),
    ).rejects.toThrowError(/地址不受信任/);
  });

  it("streams a chunk whose SHA-256 matches the manifest", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const manifest = makeSingleChunkManifest();
    manifest.chunks[0] = { ...manifest.chunks[0], sha256: sha256(bytes) };
    const fetchImpl = vi.fn(async () =>
      responseWith([bytes], { headers: { "content-length": "5" } }),
    );

    const stream = await openMergedStream(manifest, { fetchImpl });
    const merged = new Uint8Array(await new Response(stream).arrayBuffer());

    expect(Array.from(merged)).toEqual([1, 2, 3, 4, 5]);
  });

  it("errors the stream when a chunk SHA-256 does not match", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const manifest = makeSingleChunkManifest();
    manifest.chunks[0] = { ...manifest.chunks[0], sha256: sha256(new Uint8Array([9])) };
    const fetchImpl = vi.fn(async () =>
      responseWith([bytes], { headers: { "content-length": "5" } }),
    );

    const stream = await openMergedStream(manifest, { fetchImpl });
    await expect(new Response(stream).arrayBuffer()).rejects.toThrowError(/SHA-256/);
  });
});

describe("verifyMergedManifest", () => {
  it("reports per-chunk failures without aborting the whole check", async () => {
    const first = new Uint8Array(chunk).fill(1);
    const second = new Uint8Array([6, 7, 8, 9, 10]);
    const manifest = makeManifest();
    manifest.chunks[0] = { ...manifest.chunks[0], sha256: sha256(first) };
    manifest.chunks[1] = {
      ...manifest.chunks[1],
      sha256: sha256(new Uint8Array([0])),
    };
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith("/a")
        ? responseWith([first], { headers: { "content-length": String(chunk) } })
        : responseWith([second], { headers: { "content-length": "5" } }),
    );

    const report = await verifyMergedManifest(manifest, { fetchImpl });

    expect(report.valid).toBe(false);
    expect(report.integrity).toBe("sha256");
    expect(report.checkedChunks).toBe(2);
    expect(report.failures).toHaveLength(1);
    expect(report.failures[0]).toMatchObject({
      index: 1,
      code: "MERGE_CHUNK_HASH_MISMATCH",
      actualSha256: sha256(second),
    });
  });

  it("checks only the requested chunk indexes", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const manifest = makeManifest();
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      void input;
      return responseWith([bytes], { headers: { "content-length": "5" } });
    });

    const report = await verifyMergedManifest(manifest, {
      fetchImpl,
      indexes: [1],
    });

    expect(report.checkedChunks).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0][0])).toContain("/b");
  });
});

describe("normalizeUploadError", () => {
  it("maps merge download errors to ApiError", async () => {
    const { ApiError } = await import("@/lib/api");
    const { normalizeUploadError } = await import("@/lib/upload/errors");

    const normalized = normalizeUploadError(
      new MergeDownloadError("MERGE_CHUNK_FETCH_FAILED", "分片下载失败", 502),
    );

    expect(normalized).toBeInstanceOf(ApiError);
    expect((normalized as InstanceType<typeof ApiError>).status).toBe(502);
    expect((normalized as InstanceType<typeof ApiError>).code).toBe(
      "MERGE_CHUNK_FETCH_FAILED",
    );
  });
});
