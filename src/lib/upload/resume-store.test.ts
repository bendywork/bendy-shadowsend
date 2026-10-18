import { describe, expect, it } from "vitest";

import { UPLOAD_RESUME_STORAGE_KEY } from "@/lib/upload/constants";
import {
  clearUploadResumeRecords,
  createUploadFingerprint,
  createUploadResumeRecord,
  findUploadResumeRecord,
  pruneUploadResumeRecords,
  readUploadResumeRecords,
  removeUploadResumeRecord,
  saveUploadResumeRecord,
  type UploadResumeRecord,
  type UploadResumeStorage,
} from "@/lib/upload/resume-store";

const NOW = 1_700_000_000_000;
const HOUR = 60 * 60 * 1000;

function createMemoryStorage(initial?: string): UploadResumeStorage & {
  dump: () => string | null;
} {
  let value = initial ?? null;
  return {
    getItem: (key) => (key === UPLOAD_RESUME_STORAGE_KEY ? value : null),
    setItem: (key, next) => {
      if (key === UPLOAD_RESUME_STORAGE_KEY) value = next;
    },
    removeItem: (key) => {
      if (key === UPLOAD_RESUME_STORAGE_KEY) value = null;
    },
    dump: () => value,
  };
}

function buildRecord(
  overrides: Partial<UploadResumeRecord> = {},
): UploadResumeRecord {
  const record = createUploadResumeRecord({
    fingerprint: "f-00000001",
    roomCode: "ROOM01",
    fileName: "video.mp4",
    mimeType: "video/mp4",
    sizeBytes: 250,
    lastModified: 123,
    session: "session-token",
    service: "pic-sl",
    storage: "PIC_SL",
    chunkSize: 100,
    totalChunks: 3,
    lastChunkBytes: 50,
    expiresAt: NOW + 2 * HOUR,
    completedChunks: [
      { index: 0, url: "https://pic.sl.al/a", sizeBytes: 100 },
    ],
    now: NOW,
  });

  return { ...record, ...overrides };
}

describe("createUploadFingerprint", () => {
  it("is stable for the same file identity", () => {
    const input = {
      roomCode: "ROOM01",
      fileName: "video.mp4",
      sizeBytes: 250,
      lastModified: 123,
    };
    expect(createUploadFingerprint(input)).toBe(
      createUploadFingerprint({ ...input }),
    );
    expect(createUploadFingerprint(input)).toMatch(/^f-[0-9a-f]{8}$/);
  });

  it("changes when room, name, size, or mtime changes", () => {
    const base = {
      roomCode: "ROOM01",
      fileName: "video.mp4",
      sizeBytes: 250,
      lastModified: 123,
    };
    const fingerprints = new Set([
      createUploadFingerprint(base),
      createUploadFingerprint({ ...base, roomCode: "ROOM02" }),
      createUploadFingerprint({ ...base, fileName: "other.mp4" }),
      createUploadFingerprint({ ...base, sizeBytes: 251 }),
      createUploadFingerprint({ ...base, lastModified: 124 }),
    ]);
    expect(fingerprints.size).toBe(5);
  });
});

describe("resume store", () => {
  it("round-trips a record", () => {
    const storage = createMemoryStorage();
    const record = buildRecord();

    expect(saveUploadResumeRecord(storage, record)).toBe(true);
    expect(findUploadResumeRecord(storage, record.fingerprint, NOW)).toEqual(
      record,
    );
    expect(readUploadResumeRecords(storage, NOW)).toHaveLength(1);
  });

  it("returns an empty list for corrupted or foreign documents", () => {
    expect(readUploadResumeRecords(createMemoryStorage("{not json"), NOW)).toEqual(
      [],
    );
    expect(
      readUploadResumeRecords(
        createMemoryStorage(JSON.stringify({ v: 2, records: [] })),
        NOW,
      ),
    ).toEqual([]);
    expect(
      readUploadResumeRecords(
        createMemoryStorage(JSON.stringify({ v: 1, records: [{ nope: true }] })),
        NOW,
      ),
    ).toEqual([]);
  });

  it("prunes expired records", () => {
    const storage = createMemoryStorage();
    saveUploadResumeRecord(storage, buildRecord());

    expect(readUploadResumeRecords(storage, NOW + 3 * HOUR)).toEqual([]);
  });

  it("persists pruning of expired records", () => {
    const storage = createMemoryStorage();
    const expired = buildRecord({
      fingerprint: "f-0000000a",
      fileName: "expired.mp4",
      expiresAt: NOW + HOUR,
    });
    const active = buildRecord({
      fingerprint: "f-0000000b",
      fileName: "active.mp4",
      updatedAt: NOW + 1000,
    });
    saveUploadResumeRecord(storage, expired);
    saveUploadResumeRecord(storage, active);

    expect(pruneUploadResumeRecords(storage, NOW + 1.5 * HOUR)).toBe(1);
    const stored = JSON.parse(String(storage.dump())) as {
      records: UploadResumeRecord[];
    };
    expect(stored.records.map((record) => record.fingerprint)).toEqual([
      "f-0000000b",
    ]);
  });

  it("keeps at most ten most recently updated records", () => {
    const storage = createMemoryStorage();

    for (let index = 0; index < 12; index += 1) {
      saveUploadResumeRecord(
        storage,
        buildRecord({
          fingerprint: `f-${String(index).padStart(8, "0")}`,
          fileName: `video-${index}.mp4`,
          createdAt: NOW + index,
          updatedAt: NOW + index,
        }),
      );
    }

    const records = readUploadResumeRecords(storage, NOW);
    expect(records).toHaveLength(10);
    expect(records[0].fingerprint).toBe("f-00000011");
    expect(records.some((record) => record.fingerprint === "f-00000000")).toBe(
      false,
    );
  });

  it("replaces the existing record for the same fingerprint", () => {
    const storage = createMemoryStorage();
    const first = buildRecord();
    const second = buildRecord({
      completedChunks: [
        { index: 0, url: "https://pic.sl.al/a", sizeBytes: 100 },
        { index: 1, url: "https://pic.sl.al/b", sizeBytes: 100 },
      ],
      updatedAt: NOW + 1000,
    });

    saveUploadResumeRecord(storage, first);
    saveUploadResumeRecord(storage, second);

    const records = readUploadResumeRecords(storage, NOW);
    expect(records).toHaveLength(1);
    expect(records[0].completedChunks).toHaveLength(2);
  });

  it("rejects records whose chunk layout does not match the file", () => {
    const storage = createMemoryStorage();
    const invalid = buildRecord({ lastChunkBytes: 999 });

    expect(saveUploadResumeRecord(storage, invalid)).toBe(false);
    expect(storage.dump()).toBeNull();
  });

  it("never throws when storage quota is exhausted", () => {
    const storage: UploadResumeStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => undefined,
    };

    expect(saveUploadResumeRecord(storage, buildRecord())).toBe(false);
  });

  it("removes and clears records", () => {
    const storage = createMemoryStorage();
    saveUploadResumeRecord(storage, buildRecord());

    removeUploadResumeRecord(storage, "f-00000001");
    expect(readUploadResumeRecords(storage, NOW)).toEqual([]);

    saveUploadResumeRecord(storage, buildRecord());
    clearUploadResumeRecords(storage);
    expect(storage.dump()).toBeNull();
  });

  it("does not share completed chunk arrays with callers", () => {
    const chunks = [
      { index: 0, url: "https://pic.sl.al/a", sizeBytes: 100 },
    ];
    const record = createUploadResumeRecord({
      fingerprint: "f-00000002",
      roomCode: "ROOM01",
      fileName: "video.mp4",
      mimeType: "video/mp4",
      sizeBytes: 250,
      lastModified: 123,
      session: "session-token",
      service: "pic-sl",
      storage: "PIC_SL",
      chunkSize: 100,
      totalChunks: 3,
      lastChunkBytes: 50,
      expiresAt: NOW + HOUR,
      completedChunks: chunks,
      now: NOW,
    });

    chunks[0].url = "https://evil.example.com/a";
    expect(record.completedChunks[0].url).toBe("https://pic.sl.al/a");
  });
});
