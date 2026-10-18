import { describe, expect, it } from "vitest";

import {
  parseStoredUploadManifest,
  resolveRemoteAttachment,
  serializeStoredUploadManifest,
} from "@/lib/upload/stored-manifest";
import type { UploadManifest } from "@/lib/upload/types";

function manifest(overrides: Partial<UploadManifest> = {}): UploadManifest {
  return {
    uploadId: "upload-1",
    service: "pic-sl",
    storage: "PIC_SL",
    fileName: "report.pdf",
    mimeType: "application/pdf",
    sizeBytes: 6,
    chunkSize: 4,
    totalChunks: 2,
    chunks: [
      { index: 0, url: "https://pic.sl.al/f/part-0", sizeBytes: 4 },
      { index: 1, url: "https://pic.sl.al/f/part-1", sizeBytes: 2 },
    ],
    ...overrides,
  };
}

describe("stored upload manifest", () => {
  it("round-trips a valid manifest", () => {
    const value = manifest();

    expect(parseStoredUploadManifest(serializeStoredUploadManifest(value))).toEqual(
      value,
    );
  });

  it("rejects malformed JSON", () => {
    expect(parseStoredUploadManifest("{not-json")).toBeNull();
    expect(parseStoredUploadManifest("")).toBeNull();
  });

  it("rejects a manifest whose chunk sizes do not add up", () => {
    const value = manifest({
      sizeBytes: 7,
    });

    expect(parseStoredUploadManifest(JSON.stringify(value))).toBeNull();
  });

  it("rejects chunk URLs outside the service allow-list", () => {
    const value = manifest({
      chunks: [
        { index: 0, url: "https://evil.example/part-0", sizeBytes: 4 },
        { index: 1, url: "https://pic.sl.al/f/part-1", sizeBytes: 2 },
      ],
    });

    expect(parseStoredUploadManifest(JSON.stringify(value))).toBeNull();
  });

  it("rejects missing or out-of-order chunk indexes", () => {
    const value = manifest({
      chunks: [
        { index: 0, url: "https://pic.sl.al/f/part-0", sizeBytes: 4 },
        { index: 0, url: "https://pic.sl.al/f/part-1", sizeBytes: 2 },
      ],
    });

    expect(parseStoredUploadManifest(JSON.stringify(value))).toBeNull();
  });
});

describe("resolveRemoteAttachment", () => {
  it("resolves a direct remote URL for SANG and PIC_SL storage", () => {
    expect(
      resolveRemoteAttachment("SANG", "https://file.sang.pub/files/a.png"),
    ).toEqual({
      kind: "url",
      url: "https://file.sang.pub/files/a.png",
    });

    expect(
      resolveRemoteAttachment("PIC_SL", "https://pic.sl.al/f/a.pdf"),
    ).toEqual({
      kind: "url",
      url: "https://pic.sl.al/f/a.pdf",
    });
  });

  it("resolves a serialized manifest", () => {
    const resolved = resolveRemoteAttachment(
      "PIC_SL",
      serializeStoredUploadManifest(manifest()),
    );

    expect(resolved?.kind).toBe("manifest");
  });

  it("rejects remote URLs outside the service allow-list", () => {
    expect(
      resolveRemoteAttachment("SANG", "https://evil.example/a.png"),
    ).toBeNull();
  });

  it("returns null for legacy storage", () => {
    expect(resolveRemoteAttachment("S3", "rooms/a/file.txt")).toBeNull();
    expect(resolveRemoteAttachment("DUFS", "file-a.txt")).toBeNull();
  });
});
