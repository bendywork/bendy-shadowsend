import { describe, expect, it } from "vitest";

import {
  UPLOAD_CHUNK_SIZE_BYTES,
  UPLOAD_MAX_CHUNKS,
  SANG_MEITU_MAX_BYTES,
} from "@/lib/upload/constants";
import {
  assertUploadFileNameAllowed,
  assertUploadServiceLimit,
  buildChunkFileName,
  createChunkPlan,
  getFileExtension,
  resolveSangChannel,
  resolveUploadService,
  sanitizeUploadFileName,
} from "@/lib/upload/plan";

describe("createChunkPlan", () => {
  it("splits a 200MB file into 50 chunks of 4MB", () => {
    const plan = createChunkPlan(200 * 1024 * 1024);
    expect(plan.chunkSize).toBe(UPLOAD_CHUNK_SIZE_BYTES);
    expect(plan.totalChunks).toBe(UPLOAD_MAX_CHUNKS);
    expect(plan.lastChunkBytes).toBe(UPLOAD_CHUNK_SIZE_BYTES);
  });

  it("reports the remainder on the last chunk", () => {
    const plan = createChunkPlan(UPLOAD_CHUNK_SIZE_BYTES * 2 + 100);
    expect(plan.totalChunks).toBe(3);
    expect(plan.lastChunkBytes).toBe(100);
  });

  it("rejects invalid and oversized inputs", () => {
    expect(() => createChunkPlan(0)).toThrowError(/大小无效/);
    expect(() => createChunkPlan(1.5)).toThrowError(/大小无效/);
    expect(() => createChunkPlan(UPLOAD_MAX_CHUNKS * UPLOAD_CHUNK_SIZE_BYTES + 1)).toThrowError(
      /分片数量超出限制/,
    );
  });
});

describe("resolveUploadService", () => {
  it("routes images to sang and everything else to pic-sl", () => {
    expect(resolveUploadService("image/png")).toBe("sang");
    expect(resolveUploadService("IMAGE/JPEG")).toBe("sang");
    expect(resolveUploadService("application/pdf")).toBe("pic-sl");
    expect(resolveUploadService("")).toBe("pic-sl");
  });
});

describe("file name validation", () => {
  it("sanitizes path separators and control characters", () => {
    expect(sanitizeUploadFileName('..\\evil/name\u0000.txt')).toBe(".._evil_name_.txt");
    expect(sanitizeUploadFileName("   ")).toBe("upload.bin");
  });

  it("keeps the extension when truncating long names", () => {
    const result = sanitizeUploadFileName(`${"a".repeat(300)}.pdf`);
    expect(result.length).toBeLessThanOrEqual(180);
    expect(result.endsWith(".pdf")).toBe(true);
  });

  it("blocks html for sang and executable types for pic-sl", () => {
    expect(() => assertUploadFileNameAllowed("sang", "page.html")).toThrowError(
      /不能上传到图片服务/,
    );
    expect(() => assertUploadFileNameAllowed("pic-sl", "setup.exe")).toThrowError(
      /不被文件服务允许/,
    );
    expect(() => assertUploadFileNameAllowed("pic-sl", "report.pdf")).not.toThrow();
  });

  it("enforces each service size limit", () => {
    expect(() => assertUploadServiceLimit("sang", 100 * 1024 * 1024)).not.toThrow();
    expect(() => assertUploadServiceLimit("sang", 100 * 1024 * 1024 + 1)).toThrowError(
      /服务上限/,
    );
    expect(() => assertUploadServiceLimit("pic-sl", 200 * 1024 * 1024 + 1)).toThrowError(
      /服务上限/,
    );
  });
});

describe("resolveSangChannel", () => {
  it("uses meitu for small whitelisted images", () => {
    expect(
      resolveSangChannel({ fileName: "photo.JPG", sizeBytes: 1024, chunked: false }),
    ).toBe("meitu");
  });

  it("falls back to icve for large images and chunked uploads", () => {
    expect(
      resolveSangChannel({
        fileName: "photo.jpg",
        sizeBytes: SANG_MEITU_MAX_BYTES + 1,
        chunked: false,
      }),
    ).toBe("icve");
    expect(
      resolveSangChannel({ fileName: "photo.jpg", sizeBytes: 1024, chunked: true }),
    ).toBe("icve");
  });
});

describe("buildChunkFileName", () => {
  it("drops the extension for sang chunks to avoid the html block list", () => {
    expect(
      buildChunkFileName({
        fileName: "report.html",
        index: 2,
        totalChunks: 10,
        service: "sang",
      }),
    ).toBe("report.part002");
  });

  it("keeps the extension for pic-sl chunks", () => {
    expect(
      buildChunkFileName({
        fileName: "archive.tar.gz",
        index: 0,
        totalChunks: 3,
        service: "pic-sl",
      }),
    ).toBe("archive.tar.part000.gz");
  });

  it("extracts lowercase extensions", () => {
    expect(getFileExtension("A.PDF")).toBe(".pdf");
    expect(getFileExtension("README")).toBe("");
  });
});
