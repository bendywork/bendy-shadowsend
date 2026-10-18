import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api";
import {
  attachmentIntegrity,
  buildAttachmentMergeManifest,
} from "@/lib/attachment-merge";
import { UPLOAD_CHUNK_SIZE_BYTES } from "@/lib/upload/constants";

const chunk = UPLOAD_CHUNK_SIZE_BYTES;
const digest = "b".repeat(64);

function makeAttachment(overrides: Record<string, unknown> = {}) {
  return {
    id: "attachment-1",
    fileName: "archive.zip",
    mimeType: "application/zip",
    sizeBytes: BigInt(chunk + 5),
    storage: "PIC_SL",
    chunkManifest: {
      uploadId: "upload-1",
      chunkSize: chunk,
      totalChunks: 2,
      sizeBytes: chunk + 5,
      chunks: [
        {
          index: 0,
          url: "https://pic.sl.al/f/pic/2026-10-18/a",
          sizeBytes: chunk,
          sha256: digest,
        },
        {
          index: 1,
          url: "https://pic.sl.al/f/pic/2026-10-18/b",
          sizeBytes: 5,
          sha256: digest,
        },
      ],
    },
    ...overrides,
  };
}

describe("buildAttachmentMergeManifest", () => {
  it("converts a persisted attachment into an upload manifest", () => {
    const manifest = buildAttachmentMergeManifest(makeAttachment());

    expect(manifest.service).toBe("pic-sl");
    expect(manifest.storage).toBe("PIC_SL");
    expect(manifest.uploadId).toBe("upload-1");
    expect(manifest.sizeBytes).toBe(chunk + 5);
    expect(manifest.chunks).toHaveLength(2);
    expect(manifest.chunks[1].sha256).toBe(digest);
  });

  it("maps SANG storage to the sang service", () => {
    const attachment = makeAttachment({
      storage: "SANG",
      chunkManifest: {
        chunkSize: chunk,
        totalChunks: 1,
        chunks: [
          {
            index: 0,
            url: "https://file.sang.pub/f/pic/2026-10-18/a",
            sizeBytes: chunk,
          },
        ],
      },
      sizeBytes: BigInt(chunk),
    });

    expect(buildAttachmentMergeManifest(attachment).service).toBe("sang");
  });

  it("rejects non-chunked storage and invalid manifests", () => {
    expect(() =>
      buildAttachmentMergeManifest(makeAttachment({ storage: "S3" })),
    ).toThrowError(ApiError);
    expect(() =>
      buildAttachmentMergeManifest(makeAttachment({ chunkManifest: null })),
    ).toThrowError(/分片清单无效/);
  });

  it("rejects a manifest whose chunks do not add up to the attachment size", () => {
    expect(() =>
      buildAttachmentMergeManifest(
        makeAttachment({ sizeBytes: BigInt(chunk + 6) }),
      ),
    ).toThrowError(/大小不一致/);
  });
});

describe("attachmentIntegrity", () => {
  it("reports sha256 when all chunks are hashed", () => {
    expect(attachmentIntegrity(makeAttachment())).toBe("sha256");
  });

  it("reports none for legacy manifests without hashes", () => {
    const attachment = makeAttachment({
      chunkManifest: {
        chunkSize: chunk,
        totalChunks: 1,
        chunks: [
          {
            index: 0,
            url: "https://pic.sl.al/f/pic/2026-10-18/a",
            sizeBytes: chunk,
          },
        ],
      },
      sizeBytes: BigInt(chunk),
    });

    expect(attachmentIntegrity(attachment)).toBe("none");
  });
});
