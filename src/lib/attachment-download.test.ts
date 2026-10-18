import { describe, expect, it } from "vitest";

import {
  AttachmentDownloadError,
  computeCandidateChunkIndexes,
  computeFailedChunkIndex,
  downloadErrorFailedIndex,
  downloadErrorFailedIndexes,
} from "@/lib/attachment-download";

const chunkSize = 4 * 1024 * 1024;

describe("computeFailedChunkIndex", () => {
  it("maps received bytes to the chunk that failed", () => {
    expect(computeFailedChunkIndex(0, chunkSize, 5)).toBe(0);
    expect(computeFailedChunkIndex(chunkSize - 1, chunkSize, 5)).toBe(0);
    expect(computeFailedChunkIndex(chunkSize, chunkSize, 5)).toBe(1);
    expect(computeFailedChunkIndex(chunkSize * 2 + 10, chunkSize, 5)).toBe(2);
  });

  it("clamps to the last chunk and handles invalid input", () => {
    expect(computeFailedChunkIndex(chunkSize * 10, chunkSize, 3)).toBe(2);
    expect(computeFailedChunkIndex(10, 0, 3)).toBe(0);
    expect(computeFailedChunkIndex(10, chunkSize, 0)).toBe(0);
  });

  it("checks both neighbours when the stream stops on a chunk boundary", () => {
    expect(computeCandidateChunkIndexes(chunkSize * 2, chunkSize, 5)).toEqual([
      1, 2,
    ]);
    expect(computeCandidateChunkIndexes(chunkSize * 2 + 7, chunkSize, 5)).toEqual([
      2,
    ]);
  });
});

describe("downloadErrorFailedIndex", () => {
  it("reads the failed index from a download error", () => {
    const error = new AttachmentDownloadError(
      "DOWNLOAD_INCOMPLETE",
      "incomplete",
      { receivedBytes: 10, expectedBytes: 20, failedIndex: 3 },
    );

    expect(downloadErrorFailedIndex(error)).toBe(3);
    expect(downloadErrorFailedIndexes(error)).toEqual([3]);
    expect(downloadErrorFailedIndex(new Error("other"))).toBeUndefined();
  });
});
