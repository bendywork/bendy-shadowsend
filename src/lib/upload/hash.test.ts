import { describe, expect, it } from "vitest";

import {
  hasCompleteChunkHashes,
  manifestIntegrity,
  normalizeSha256,
} from "@/lib/upload/hash";

const digest = "a".repeat(64);

describe("normalizeSha256", () => {
  it("accepts 64-character hex digests and lower-cases them", () => {
    expect(normalizeSha256(digest)).toBe(digest);
    expect(normalizeSha256(`  ${digest.toUpperCase()}  `)).toBe(digest);
  });

  it("rejects malformed values", () => {
    expect(normalizeSha256(undefined)).toBeNull();
    expect(normalizeSha256(null)).toBeNull();
    expect(normalizeSha256(123)).toBeNull();
    expect(normalizeSha256("a".repeat(63))).toBeNull();
    expect(normalizeSha256("g".repeat(64))).toBeNull();
  });
});

describe("manifestIntegrity", () => {
  it("reports sha256 only when every chunk carries a valid hash", () => {
    expect(hasCompleteChunkHashes([{ sha256: digest }])).toBe(true);
    expect(manifestIntegrity([{ sha256: digest }])).toBe("sha256");
    expect(manifestIntegrity([{ sha256: digest }, {}])).toBe("none");
    expect(manifestIntegrity([])).toBe("none");
  });
});
