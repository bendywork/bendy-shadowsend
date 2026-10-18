import { describe, expect, it } from "vitest";
import {
  PIC_SL_ALLOWED_EXTENSIONS,
  PIC_SL_MAX_BYTES,
  SANG_MAX_BYTES,
  SANG_MEITU_MAX_BYTES,
  UPLOAD_CHUNK_SIZE_BYTES,
  UPLOAD_MAX_CHUNKS,
  UPLOAD_SINGLE_REQUEST_MAX_BYTES,
  VERCEL_FUNCTION_BODY_LIMIT_BYTES,
  createUploadChunkPlan,
  getExpectedChunkBytes,
  getFileExtension,
  isImageFile,
  isUploadChunkSizeValid,
  resolveSangChannel,
  resolveUploadService,
  uploadPreflightErrorMessage,
  uploadPreflightHttpStatus,
  validateUploadFile,
} from "@/lib/upload-preflight";

const MB = 1024 * 1024;

function expectFailure(
  result: ReturnType<typeof validateUploadFile>,
  code: string,
) {
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error.code).toBe(code);
}

describe("upload constants", () => {
  it("keeps every single request below the Vercel 4.5MB body limit", () => {
    expect(VERCEL_FUNCTION_BODY_LIMIT_BYTES).toBe(Math.floor(4.5 * MB));
    expect(UPLOAD_CHUNK_SIZE_BYTES).toBe(4 * MB);
    expect(UPLOAD_SINGLE_REQUEST_MAX_BYTES).toBe(UPLOAD_CHUNK_SIZE_BYTES);
    expect(UPLOAD_SINGLE_REQUEST_MAX_BYTES).toBeLessThan(
      VERCEL_FUNCTION_BODY_LIMIT_BYTES,
    );
  });

  it("plans 50 chunks for the 200MB pic.sl.al limit", () => {
    expect(PIC_SL_MAX_BYTES).toBe(200 * MB);
    expect(SANG_MAX_BYTES).toBe(100 * MB);
    expect(SANG_MEITU_MAX_BYTES).toBe(20 * MB);
    expect(UPLOAD_MAX_CHUNKS).toBe(50);
  });

  it("keeps the pic.sl.al extension whitelist at 58 entries", () => {
    expect(PIC_SL_ALLOWED_EXTENSIONS).toHaveLength(58);
    expect(new Set(PIC_SL_ALLOWED_EXTENSIONS).size).toBe(58);
    expect(PIC_SL_ALLOWED_EXTENSIONS).toContain(".pdf");
    expect(PIC_SL_ALLOWED_EXTENSIONS).toContain(".mp4");
    expect(PIC_SL_ALLOWED_EXTENSIONS).not.toContain(".html");
    expect(PIC_SL_ALLOWED_EXTENSIONS).not.toContain(".exe");
  });
});

describe("getFileExtension", () => {
  it("returns lowercase extensions without the dot", () => {
    expect(getFileExtension("photo.PNG")).toBe("png");
    expect(getFileExtension("archive.tar.gz")).toBe("gz");
  });

  it("handles paths, hidden files and missing extensions", () => {
    expect(getFileExtension("/tmp/dir/report.pdf")).toBe("pdf");
    expect(getFileExtension("C:\\tmp\\report.pdf")).toBe("pdf");
    expect(getFileExtension(".gitignore")).toBe("");
    expect(getFileExtension("README")).toBe("");
    expect(getFileExtension("trailing.")).toBe("");
  });
});

describe("resolveUploadService / resolveSangChannel", () => {
  it("routes images to sang and everything else to pic.sl.al", () => {
    expect(resolveUploadService("photo.png", "")).toBe("sang");
    expect(resolveUploadService("blob", "image/webp")).toBe("sang");
    expect(resolveUploadService("report.pdf", "application/pdf")).toBe("pic-sl");
    expect(resolveUploadService("archive.zip", "")).toBe("pic-sl");
  });

  it("uses meitu for the five supported image types up to 20MB", () => {
    expect(resolveSangChannel("photo.jpg", 20 * MB)).toBe("meitu");
    expect(resolveSangChannel("photo.webp", 1)).toBe("meitu");
    expect(resolveSangChannel("photo.png", 20 * MB + 1)).toBe("icve");
    expect(resolveSangChannel("photo.bmp", 1)).toBe("icve");
  });

  it("rejects HTML and files above the sang limit", () => {
    expect(resolveSangChannel("page.html", 1)).toBeNull();
    expect(resolveSangChannel("page.htm", 1)).toBeNull();
    expect(resolveSangChannel("photo.png", 100 * MB + 1)).toBeNull();
    expect(resolveSangChannel("photo.png", 0)).toBeNull();
  });

  it("treats image extensions case-insensitively", () => {
    expect(isImageFile("PHOTO.JPEG", "")).toBe(true);
    expect(isImageFile("notes.txt", "text/plain")).toBe(false);
  });
});

describe("createUploadChunkPlan", () => {
  it("keeps files up to one chunk in a single request", () => {
    expect(createUploadChunkPlan(1)).toMatchObject({
      totalChunks: 1,
      lastChunkBytes: 1,
      requiresChunking: false,
    });
    expect(createUploadChunkPlan(4 * MB)).toMatchObject({
      totalChunks: 1,
      lastChunkBytes: 4 * MB,
      requiresChunking: false,
    });
  });

  it("splits the first byte beyond a chunk boundary", () => {
    expect(createUploadChunkPlan(4 * MB + 1)).toMatchObject({
      totalChunks: 2,
      chunkSize: 4 * MB,
      lastChunkBytes: 1,
      requiresChunking: true,
    });
  });

  it("precomputes exactly 50 chunks for 200MB", () => {
    const plan = createUploadChunkPlan(200 * MB);
    expect(plan.totalChunks).toBe(50);
    expect(plan.lastChunkBytes).toBe(4 * MB);
    expect(plan.totalChunks).toBe(UPLOAD_MAX_CHUNKS);
  });

  it("supports a custom chunk size", () => {
    const plan = createUploadChunkPlan(7 * MB, 3 * MB);
    expect(plan.totalChunks).toBe(3);
    expect(plan.lastChunkBytes).toBe(1 * MB);
  });

  it("rejects invalid sizes and chunk sizes", () => {
    expect(() => createUploadChunkPlan(0)).toThrow(RangeError);
    expect(() => createUploadChunkPlan(-1)).toThrow(RangeError);
    expect(() => createUploadChunkPlan(1.5)).toThrow(RangeError);
    expect(() => createUploadChunkPlan(1, 0)).toThrow(RangeError);
  });
});

describe("chunk size checks", () => {
  const plan = createUploadChunkPlan(9 * MB);

  it("returns the expected size for each chunk", () => {
    expect(getExpectedChunkBytes(plan, 0)).toBe(4 * MB);
    expect(getExpectedChunkBytes(plan, 1)).toBe(4 * MB);
    expect(getExpectedChunkBytes(plan, 2)).toBe(1 * MB);
    expect(getExpectedChunkBytes(plan, 3)).toBeNull();
    expect(getExpectedChunkBytes(plan, -1)).toBeNull();
  });

  it("validates actual chunk sizes exactly", () => {
    expect(isUploadChunkSizeValid(plan, 0, 4 * MB)).toBe(true);
    expect(isUploadChunkSizeValid(plan, 2, 1 * MB)).toBe(true);
    expect(isUploadChunkSizeValid(plan, 2, 2 * MB)).toBe(false);
    expect(isUploadChunkSizeValid(plan, 0, 4 * MB + 1)).toBe(false);
  });
});

describe("validateUploadFile", () => {
  it("rejects empty files before anything else", () => {
    expectFailure(
      validateUploadFile({ fileName: "empty.png", mimeType: "image/png", sizeBytes: 0 }),
      "UPLOAD_FILE_EMPTY",
    );
  });

  it("rejects invalid sizes", () => {
    expectFailure(
      validateUploadFile({ fileName: "a.png", mimeType: "image/png", sizeBytes: -1 }),
      "UPLOAD_SIZE_INVALID",
    );
    expectFailure(
      validateUploadFile({ fileName: "a.png", mimeType: "image/png", sizeBytes: Number.NaN }),
      "UPLOAD_SIZE_INVALID",
    );
    expectFailure(
      validateUploadFile({ fileName: "a.png", mimeType: "image/png", sizeBytes: 1.5 }),
      "UPLOAD_SIZE_INVALID",
    );
  });

  it("rejects extensions outside the pic.sl.al whitelist", () => {
    expectFailure(
      validateUploadFile({ fileName: "page.html", mimeType: "text/html", sizeBytes: 1 }),
      "UPLOAD_TYPE_UNSUPPORTED",
    );
    expectFailure(
      validateUploadFile({ fileName: "setup.exe", mimeType: "application/octet-stream", sizeBytes: 1 }),
      "UPLOAD_TYPE_UNSUPPORTED",
    );
    expectFailure(
      validateUploadFile({ fileName: "README", mimeType: "text/plain", sizeBytes: 1 }),
      "UPLOAD_TYPE_UNSUPPORTED",
    );
  });

  it("accepts whitelisted non-image files up to 200MB", () => {
    const result = validateUploadFile({
      fileName: "report.PDF",
      mimeType: "application/pdf",
      sizeBytes: 200 * MB,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.service).toBe("pic-sl");
    expect(result.channel).toBeNull();
    expect(result.limitBytes).toBe(PIC_SL_MAX_BYTES);
    expect(result.chunkPlan.totalChunks).toBe(50);
  });

  it("rejects non-image files above 200MB", () => {
    expectFailure(
      validateUploadFile({
        fileName: "backup.zip",
        mimeType: "application/zip",
        sizeBytes: 200 * MB + 1,
      }),
      "UPLOAD_SERVICE_LIMIT_EXCEEDED",
    );
  });

  it("routes small and large images through the right sang channel", () => {
    const small = validateUploadFile({
      fileName: "photo.png",
      mimeType: "image/png",
      sizeBytes: 20 * MB,
    });
    expect(small.ok).toBe(true);
    if (small.ok) {
      expect(small.service).toBe("sang");
      expect(small.channel).toBe("meitu");
      expect(small.limitBytes).toBe(SANG_MAX_BYTES);
    }

    const large = validateUploadFile({
      fileName: "photo.png",
      mimeType: "image/png",
      sizeBytes: 20 * MB + 1,
    });
    expect(large.ok).toBe(true);
    if (large.ok) expect(large.channel).toBe("icve");
  });

  it("accepts images up to the 100MB sang limit and rejects beyond", () => {
    const atLimit = validateUploadFile({
      fileName: "photo.png",
      mimeType: "image/png",
      sizeBytes: 100 * MB,
    });
    expect(atLimit.ok).toBe(true);

    expectFailure(
      validateUploadFile({
        fileName: "photo.png",
        mimeType: "image/png",
        sizeBytes: 100 * MB + 1,
      }),
      "UPLOAD_SERVICE_LIMIT_EXCEEDED",
    );
  });

  it("rejects HTML even when the browser reports an image MIME type", () => {
    expectFailure(
      validateUploadFile({
        fileName: "payload.html",
        mimeType: "image/png",
        sizeBytes: 1,
      }),
      "UPLOAD_TYPE_UNSUPPORTED",
    );
  });

  it("keeps chunk plans consistent for files just above one chunk", () => {
    const result = validateUploadFile({
      fileName: "clip.mp4",
      mimeType: "video/mp4",
      sizeBytes: 4 * MB + 1,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.chunkPlan.totalChunks).toBe(2);
    expect(result.chunkPlan.lastChunkBytes).toBe(1);
  });
});

describe("uploadPreflightErrorMessage", () => {
  it("renders actionable Chinese messages", () => {
    expect(
      uploadPreflightErrorMessage({
        code: "UPLOAD_TYPE_UNSUPPORTED",
        messageKey: "toast.uploadUnsupportedType",
        params: { ext: "exe" },
      }),
    ).toContain(".exe");
    expect(
      uploadPreflightErrorMessage({
        code: "UPLOAD_SERVICE_LIMIT_EXCEEDED",
        messageKey: "toast.uploadTooLargeForService",
        params: { service: "sang", max: 100 },
      }),
    ).toBe("文件超过图片服务的 100MB 上限");
    expect(
      uploadPreflightErrorMessage({
        code: "UPLOAD_CHUNK_COUNT_EXCEEDED",
        messageKey: "toast.uploadChunkCountExceeded",
        params: { count: 51, max: 50 },
      }),
    ).toContain("51");
  });
});

describe("uploadPreflightHttpStatus", () => {
  it("maps error codes to HTTP statuses", () => {
    expect(
      uploadPreflightHttpStatus({
        code: "UPLOAD_TYPE_UNSUPPORTED",
        messageKey: "toast.uploadUnsupportedType",
        params: {},
      }),
    ).toBe(415);
    expect(
      uploadPreflightHttpStatus({
        code: "UPLOAD_SERVICE_LIMIT_EXCEEDED",
        messageKey: "toast.uploadTooLargeForService",
        params: {},
      }),
    ).toBe(413);
    expect(
      uploadPreflightHttpStatus({
        code: "UPLOAD_FILE_EMPTY",
        messageKey: "toast.uploadEmptyFile",
        params: {},
      }),
    ).toBe(400);
  });
});
