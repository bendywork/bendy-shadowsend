import { describe, expect, it } from "vitest";
import { chunkManifestSchema, isRemoteFileUrl, remoteAttachmentSchema, UPLOAD_CHUNK_BYTES } from "@/lib/attachment-storage";
import { roomAnnouncementSchema, sendMessageSchema } from "@/lib/validators";

const url = "https://s3v2.lamen.top/2026/11/15/test.bin";
const attachment = { storage: "REMOTE", s3Key: url, fileName: "test.bin", mimeType: "application/octet-stream", sizeBytes: 3 };
const manifest = {
  version: 1, chunkSize: UPLOAD_CHUNK_BYTES, sizeBytes: 12 * 1024 * 1024,
  chunks: [
    { index: 0, url, sizeBytes: UPLOAD_CHUNK_BYTES, sha256: "a".repeat(64) },
    { index: 1, url: `${url}-1`, sizeBytes: 4 * 1024 * 1024, sha256: "b".repeat(64) },
  ],
};

describe("unified attachment contract", () => {
  it.each(["image/png", "video/mp4", "audio/webm", "application/pdf", "application/zip", "application/octet-stream"])("accepts %s through the same storage", (mimeType) => {
    expect(sendMessageSchema.safeParse({ attachments: [{ ...attachment, mimeType }] }).success).toBe(true);
  });

  it.each(["S3", "DUFS", "SANG", "PIC_SL", undefined])("rejects new writes to retired or missing storage %s", (storage) => {
    expect(remoteAttachmentSchema.safeParse({ ...attachment, storage }).success).toBe(false);
  });

  it("allows only the documented or verified HTTPS file hosts", () => {
    expect(isRemoteFileUrl(url)).toBe(true);
    expect(isRemoteFileUrl("https://s3v2.haikouer.top/file.txt")).toBe(true);
    for (const invalid of [
      "http://s3v2.lamen.top/file", "https://s3v2.lamen.top.evil.test/file", "https://127.0.0.1/file",
      "https://user:pass@s3v2.lamen.top/file", "https://s3v2.lamen.top:444/file", "https://s3v2.lamen.top/file#fragment",
      "javascript:alert(1)", "file:///etc/passwd", "not a URL",
    ]) expect(isRemoteFileUrl(invalid), invalid).toBe(false);
  });

  it("requires a complete manifest for files above the single-upload threshold", () => {
    expect(remoteAttachmentSchema.safeParse({ ...attachment, sizeBytes: manifest.sizeBytes }).success).toBe(false);
    expect(remoteAttachmentSchema.safeParse({ ...attachment, sizeBytes: manifest.sizeBytes, chunkManifest: manifest }).success).toBe(true);
  });

  it("rejects mismatched attachment metadata or first-chunk URL", () => {
    expect(remoteAttachmentSchema.safeParse({ ...attachment, chunkManifest: manifest }).success).toBe(false);
    expect(remoteAttachmentSchema.safeParse({ ...attachment, s3Key: `${url}-wrong`, sizeBytes: manifest.sizeBytes, chunkManifest: manifest }).success).toBe(false);
  });

  it("rejects missing, reordered, oversized or unhashed chunks", () => {
    for (const chunks of [
      manifest.chunks.slice(0, 1), [...manifest.chunks].reverse(),
      [{ ...manifest.chunks[0], sizeBytes: 1 }, manifest.chunks[1]],
      [{ ...manifest.chunks[0], sha256: "invalid" }, manifest.chunks[1]],
      [manifest.chunks[0], { ...manifest.chunks[1], url: "https://evil.test/data" }],
    ]) expect(chunkManifestSchema.safeParse({ ...manifest, chunks }).success).toBe(false);
  });

  it("uses the same contract for announcement images, with image-specific limits", () => {
    const image = { ...attachment, mimeType: "image/png", fileName: "image.png" };
    expect(roomAnnouncementSchema.safeParse({ newImages: [image] }).success).toBe(true);
    expect(roomAnnouncementSchema.safeParse({ newImages: [attachment] }).success).toBe(false);
    expect(roomAnnouncementSchema.safeParse({ newImages: [{ ...image, storage: "S3" }] }).success).toBe(false);
  });

  it("validates retry identifiers and prevents filename/header injection", () => {
    expect(sendMessageSchema.safeParse({ content: "retry", clientMessageId: "local-123-abc" }).success).toBe(true);
    expect(sendMessageSchema.safeParse({ content: "retry", clientMessageId: "bad\nkey" }).success).toBe(false);
    expect(remoteAttachmentSchema.safeParse({ ...attachment, fileName: 'test\r\nX-Evil: true' }).success).toBe(false);
  });
});
