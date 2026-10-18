import { describe, expect, it } from "vitest";

import {
  isAllowedRemoteAttachmentUrl,
  isAttachmentStorageValue,
  isChunkedAttachment,
  isRemoteAttachmentStorage,
  parseAttachmentChunkManifest,
  resolveAttachmentReadMode,
} from "@/lib/attachment-storage";

const CHUNK_SIZE = 4 * 1024 * 1024;

function validManifest(overrides: Record<string, unknown> = {}) {
  return {
    uploadId: "upload-1",
    chunkSize: CHUNK_SIZE,
    totalChunks: 3,
    sizeBytes: CHUNK_SIZE * 2 + 1024,
    chunks: [
      {
        index: 0,
        url: "https://file.icve.com.cn/file_doc/chunk-0",
        sizeBytes: CHUNK_SIZE,
      },
      {
        index: 1,
        url: "https://file.icve.com.cn/file_doc/chunk-1",
        sizeBytes: CHUNK_SIZE,
      },
      {
        index: 2,
        url: "https://file.icve.com.cn/file_doc/chunk-2",
        sizeBytes: 1024,
      },
    ],
    ...overrides,
  };
}

describe("attachment storage values", () => {
  it("accepts only the two remote storage values", () => {
    for (const value of ["SANG", "PIC_SL"]) {
      expect(isAttachmentStorageValue(value)).toBe(true);
    }
  });

  it("rejects unknown, lowercase or non-string storage values", () => {
    for (const value of ["sang", "PIC-SL", "OSS", "S3", "DUFS", "", null, undefined, 1]) {
      expect(isAttachmentStorageValue(value)).toBe(false);
    }
  });

  it("marks only SANG and PIC_SL as remote storages", () => {
    expect(isRemoteAttachmentStorage("SANG")).toBe(true);
    expect(isRemoteAttachmentStorage("PIC_SL")).toBe(true);
    expect(isRemoteAttachmentStorage("unknown")).toBe(false);
  });
});

describe("remote attachment URLs", () => {
  it("accepts HTTPS URLs on the file.sang.pub channels", () => {
    expect(
      isAllowedRemoteAttachmentUrl(
        "SANG",
        "https://file.icve.com.cn/file_doc/abc.pdf",
      ),
    ).toBe(true);
    expect(
      isAllowedRemoteAttachmentUrl(
        "SANG",
        "https://xiuxiu-pro-new.meitudata.com/posters/abc.png",
      ),
    ).toBe(true);
    expect(
      isAllowedRemoteAttachmentUrl("SANG", "https://file.sang.pub/abc"),
    ).toBe(true);
  });

  it("accepts HTTPS URLs on pic.sl.al only", () => {
    expect(
      isAllowedRemoteAttachmentUrl(
        "PIC_SL",
        "https://pic.sl.al/f/pic/2026-10-18/file_abc.pdf",
      ),
    ).toBe(true);
    expect(
      isAllowedRemoteAttachmentUrl("PIC_SL", "https://file.icve.com.cn/a.pdf"),
    ).toBe(false);
    expect(
      isAllowedRemoteAttachmentUrl("PIC_SL", "https://pic.sl.al.evil.example/a"),
    ).toBe(false);
  });

  it("rejects non-HTTPS, malformed and cross-service URLs", () => {
    expect(
      isAllowedRemoteAttachmentUrl("SANG", "http://file.icve.com.cn/a.pdf"),
    ).toBe(false);
    expect(isAllowedRemoteAttachmentUrl("SANG", "not a url")).toBe(false);
    expect(
      isAllowedRemoteAttachmentUrl(
        "SANG",
        "https://pic.sl.al/f/pic/2026-10-18/file_abc.pdf",
      ),
    ).toBe(false);
  });
});

describe("attachment chunk manifest", () => {
  it("normalizes a valid manifest", () => {
    const manifest = parseAttachmentChunkManifest(validManifest(), "SANG");

    expect(manifest).toEqual({
      uploadId: "upload-1",
      chunkSize: CHUNK_SIZE,
      totalChunks: 3,
      sizeBytes: CHUNK_SIZE * 2 + 1024,
      chunks: [
        {
          index: 0,
          url: "https://file.icve.com.cn/file_doc/chunk-0",
          sizeBytes: CHUNK_SIZE,
        },
        {
          index: 1,
          url: "https://file.icve.com.cn/file_doc/chunk-1",
          sizeBytes: CHUNK_SIZE,
        },
        {
          index: 2,
          url: "https://file.icve.com.cn/file_doc/chunk-2",
          sizeBytes: 1024,
        },
      ],
    });
  });

  it("accepts the up-03 UploadManifest shape and ignores extra fields", () => {
    const manifest = parseAttachmentChunkManifest(
      {
        ...validManifest(),
        service: "sang",
        storage: "SANG",
        fileName: "report.pdf",
        mimeType: "application/pdf",
      },
      "SANG",
    );

    expect(manifest?.totalChunks).toBe(3);
    expect(manifest?.chunks).toHaveLength(3);
  });

  it("rejects manifests for unknown storages", () => {
    expect(parseAttachmentChunkManifest(validManifest(), "OSS")).toBeNull();
  });

  it("rejects a chunk count that does not match totalChunks", () => {
    const manifest = validManifest({ totalChunks: 2 });

    expect(parseAttachmentChunkManifest(manifest, "SANG")).toBeNull();
  });

  it("rejects non-contiguous chunk indexes", () => {
    const manifest = validManifest();
    manifest.chunks[1].index = 2;

    expect(parseAttachmentChunkManifest(manifest, "SANG")).toBeNull();
  });

  it("rejects non-HTTPS or wrong-host chunk URLs", () => {
    const insecure = validManifest();
    insecure.chunks[0].url = "http://file.icve.com.cn/chunk-0";
    expect(parseAttachmentChunkManifest(insecure, "SANG")).toBeNull();

    const wrongHost = validManifest();
    wrongHost.chunks[0].url = "https://pic.sl.al/f/chunk-0";
    expect(parseAttachmentChunkManifest(wrongHost, "SANG")).toBeNull();
  });

  it("rejects chunks with a size that does not match chunkSize", () => {
    const manifest = validManifest();
    manifest.chunks[0].sizeBytes = CHUNK_SIZE - 1;

    expect(parseAttachmentChunkManifest(manifest, "SANG")).toBeNull();
  });

  it("rejects a total size that does not match the chunk sum", () => {
    const manifest = validManifest({ sizeBytes: CHUNK_SIZE * 3 });

    expect(parseAttachmentChunkManifest(manifest, "SANG")).toBeNull();
  });

  it("rejects a manifest storage that differs from the attachment storage", () => {
    const manifest = validManifest({ storage: "PIC_SL" });

    expect(parseAttachmentChunkManifest(manifest, "SANG")).toBeNull();
  });

  it("rejects manifests above the 50-chunk limit", () => {
    const chunks = Array.from({ length: 51 }, (_, index) => ({
      index,
      url: `https://file.icve.com.cn/chunk-${index}`,
      sizeBytes: CHUNK_SIZE,
    }));
    const manifest = {
      chunkSize: CHUNK_SIZE,
      totalChunks: 51,
      sizeBytes: CHUNK_SIZE * 51,
      chunks,
    };

    expect(parseAttachmentChunkManifest(manifest, "SANG")).toBeNull();
  });

  it("detects only valid chunk manifests", () => {
    expect(isChunkedAttachment(validManifest(), "SANG")).toBe(true);
    expect(isChunkedAttachment(null, "SANG")).toBe(false);
    expect(isChunkedAttachment(validManifest(), "OSS")).toBe(false);
    expect(isChunkedAttachment({ totalChunks: 2 }, "SANG")).toBe(false);
  });
});

describe("attachment read mode", () => {
  it("rejects unknown storages", () => {
    expect(resolveAttachmentReadMode("S3")).toBeNull();
    expect(resolveAttachmentReadMode("DUFS")).toBeNull();
    expect(resolveAttachmentReadMode("OSS")).toBeNull();
  });

  it("routes remote storages to a direct URL or the chunked path", () => {
    const picSlManifest = validManifest({
      chunks: [
        {
          index: 0,
          url: "https://pic.sl.al/f/pic/2026-10-18/chunk-0",
          sizeBytes: CHUNK_SIZE,
        },
        {
          index: 1,
          url: "https://pic.sl.al/f/pic/2026-10-18/chunk-1",
          sizeBytes: CHUNK_SIZE,
        },
        {
          index: 2,
          url: "https://pic.sl.al/f/pic/2026-10-18/chunk-2",
          sizeBytes: 1024,
        },
      ],
    });

    expect(resolveAttachmentReadMode("SANG")).toBe("remote");
    expect(resolveAttachmentReadMode("PIC_SL")).toBe("remote");
    expect(resolveAttachmentReadMode("SANG", validManifest())).toBe("chunked");
    expect(resolveAttachmentReadMode("PIC_SL", picSlManifest)).toBe("chunked");
  });

  it("rejects an invalid chunk manifest instead of serving a partial file", () => {
    expect(
      resolveAttachmentReadMode("SANG", { totalChunks: 2 }),
    ).toBeNull();
  });
});
