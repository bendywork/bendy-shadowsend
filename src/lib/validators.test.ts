import { describe, expect, it } from "vitest";

import { roomAnnouncementSchema, sendMessageSchema } from "@/lib/validators";

const CHUNK_SIZE = 4 * 1024 * 1024;

const baseAttachment = {
  fileName: "report.pdf",
  mimeType: "application/pdf",
  sizeBytes: CHUNK_SIZE * 2,
  s3Key: "https://file.icve.com.cn/file_doc/report.pdf",
  storage: "SANG" as const,
};

const validManifest = {
  uploadId: "upload-1",
  chunkSize: CHUNK_SIZE,
  totalChunks: 2,
  sizeBytes: CHUNK_SIZE * 2,
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
  ],
};

function parseAttachment(attachment: Record<string, unknown>) {
  return sendMessageSchema.safeParse({ attachments: [attachment] });
}

describe("sendMessageSchema attachment storage", () => {
  it("rejects legacy S3 and DUFS attachments", () => {
    expect(
      parseAttachment({ ...baseAttachment, s3Key: "rooms/a/file.pdf", storage: "S3" })
        .success,
    ).toBe(false);
    expect(
      parseAttachment({ ...baseAttachment, s3Key: "file-abc.pdf", storage: "DUFS" })
        .success,
    ).toBe(false);
  });

  it("requires an explicit storage value", () => {
    expect(
      parseAttachment({
        fileName: baseAttachment.fileName,
        mimeType: baseAttachment.mimeType,
        sizeBytes: baseAttachment.sizeBytes,
        s3Key: baseAttachment.s3Key,
      }).success,
    ).toBe(false);
  });

  it("accepts SANG and PIC_SL remote attachments", () => {
    expect(parseAttachment(baseAttachment).success).toBe(true);
    expect(
      parseAttachment({
        ...baseAttachment,
        storage: "PIC_SL",
        s3Key: "https://pic.sl.al/f/pic/2026-10-18/report.pdf",
      }).success,
    ).toBe(true);
  });

  it("rejects remote attachments whose URL is not on the service whitelist", () => {
    const result = parseAttachment({
      ...baseAttachment,
      s3Key: "https://evil.example/report.pdf",
    });

    expect(result.success).toBe(false);
  });

  it("rejects unknown storage values", () => {
    const result = parseAttachment({ ...baseAttachment, storage: "OSS" });

    expect(result.success).toBe(false);
  });

  it("accepts a chunk manifest when s3Key is the first chunk URL", () => {
    const result = parseAttachment({
      ...baseAttachment,
      s3Key: validManifest.chunks[0].url,
      chunkManifest: validManifest,
    });

    expect(result.success).toBe(true);
  });

  it("rejects a chunk manifest on a legacy storage", () => {
    const result = parseAttachment({
      ...baseAttachment,
      storage: "S3",
      s3Key: "rooms/a/file.pdf",
      chunkManifest: validManifest,
    });

    expect(result.success).toBe(false);
  });

  it("rejects a chunk manifest whose first chunk is not s3Key", () => {
    const result = parseAttachment({
      ...baseAttachment,
      chunkManifest: validManifest,
    });

    expect(result.success).toBe(false);
  });

  it("rejects an invalid chunk manifest", () => {
    const result = parseAttachment({
      ...baseAttachment,
      s3Key: validManifest.chunks[0].url,
      chunkManifest: { ...validManifest, totalChunks: 3 },
    });

    expect(result.success).toBe(false);
  });
});

describe("roomAnnouncementSchema storage", () => {
  it("accepts remote announcement images", () => {
    const result = roomAnnouncementSchema.safeParse({
      newImages: [
        {
          s3Key: "https://pic.sl.al/f/pic/2026-10-18/notice.png",
          fileName: "notice.png",
          mimeType: "image/png",
          sizeBytes: 1024,
          storage: "PIC_SL",
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("rejects remote announcement images with a foreign host", () => {
    const result = roomAnnouncementSchema.safeParse({
      newImages: [
        {
          s3Key: "https://evil.example/notice.png",
          fileName: "notice.png",
          mimeType: "image/png",
          sizeBytes: 1024,
          storage: "SANG",
        },
      ],
    });

    expect(result.success).toBe(false);
  });
});
