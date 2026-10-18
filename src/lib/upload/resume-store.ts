import {
  UPLOAD_RESUME_MAX_RECORDS,
  UPLOAD_RESUME_STORAGE_KEY,
} from "@/lib/upload/constants";
import type {
  UploadChunkDescriptor,
  UploadServiceId,
  UploadStorageId,
} from "@/lib/upload/types";
import { storageForService } from "@/lib/upload/types";

export type UploadResumeStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

export type UploadResumeRecord = {
  v: 1;
  fingerprint: string;
  roomCode: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  lastModified: number;
  session: string;
  service: UploadServiceId;
  storage: UploadStorageId;
  chunkSize: number;
  totalChunks: number;
  lastChunkBytes: number;
  expiresAt: number;
  completedChunks: UploadChunkDescriptor[];
  createdAt: number;
  updatedAt: number;
};

export type UploadResumeFingerprintInput = {
  roomCode: string;
  fileName: string;
  sizeBytes: number;
  lastModified: number;
};

type ResumeDocument = {
  v: 1;
  records: UploadResumeRecord[];
};

function isSafeInteger(value: unknown, minimum = 0): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= minimum
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * FNV-1a 32-bit over a stable identity string. This is a local cache key, not
 * a security primitive; it only needs to avoid collisions between the handful
 * of files a room member uploads from one browser.
 */
export function createUploadFingerprint(
  input: UploadResumeFingerprintInput,
): string {
  const identity = [
    input.roomCode,
    input.fileName,
    String(input.sizeBytes),
    String(input.lastModified),
  ].join("\u0000");

  let hash = 0x811c9dc5;
  for (let index = 0; index < identity.length; index += 1) {
    hash ^= identity.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return `f-${hash.toString(16).padStart(8, "0")}`;
}

function isChunkDescriptor(value: unknown): value is UploadChunkDescriptor {
  if (!value || typeof value !== "object") return false;
  const chunk = value as Record<string, unknown>;
  return (
    isSafeInteger(chunk.index) &&
    isNonEmptyString(chunk.url) &&
    isSafeInteger(chunk.sizeBytes, 1)
  );
}

function expectedBytes(record: UploadResumeRecord, index: number): number {
  return index === record.totalChunks - 1
    ? record.lastChunkBytes
    : record.chunkSize;
}

function isValidChunkList(record: UploadResumeRecord): boolean {
  if (!Array.isArray(record.completedChunks)) return false;

  const seen = new Set<number>();
  for (const chunk of record.completedChunks) {
    if (!isChunkDescriptor(chunk)) return false;
    if (chunk.index >= record.totalChunks || seen.has(chunk.index)) {
      return false;
    }
    if (chunk.sizeBytes !== expectedBytes(record, chunk.index)) {
      return false;
    }
    seen.add(chunk.index);
  }

  return true;
}

function isUploadResumeRecord(value: unknown): value is UploadResumeRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;

  if (record.v !== 1) return false;
  if (!isNonEmptyString(record.fingerprint)) return false;
  if (!isNonEmptyString(record.roomCode)) return false;
  if (!isNonEmptyString(record.fileName)) return false;
  if (typeof record.mimeType !== "string") return false;
  if (!isNonEmptyString(record.session)) return false;
  if (record.service !== "sang" && record.service !== "pic-sl") return false;
  if (record.storage !== "SANG" && record.storage !== "PIC_SL") return false;
  if (record.storage !== storageForService(record.service)) return false;

  const numericFields = [
    "sizeBytes",
    "chunkSize",
    "totalChunks",
    "lastChunkBytes",
    "expiresAt",
    "createdAt",
    "updatedAt",
  ] as const;

  for (const field of numericFields) {
    if (!isSafeInteger(record[field], 1)) return false;
  }

  if (!isSafeInteger(record.lastModified)) return false;

  const sizeBytes = record.sizeBytes as number;
  const chunkSize = record.chunkSize as number;
  const totalChunks = record.totalChunks as number;
  const lastChunkBytes = record.lastChunkBytes as number;

  if (totalChunks !== Math.ceil(sizeBytes / chunkSize)) return false;
  if (lastChunkBytes !== sizeBytes - (totalChunks - 1) * chunkSize) {
    return false;
  }

  return isValidChunkList(record as unknown as UploadResumeRecord);
}

function emptyDocument(): ResumeDocument {
  return { v: 1, records: [] };
}

function parseDocument(raw: string | null): ResumeDocument {
  if (!raw) return emptyDocument();

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return emptyDocument();
    const document = parsed as Record<string, unknown>;
    if (document.v !== 1 || !Array.isArray(document.records)) {
      return emptyDocument();
    }
    return {
      v: 1,
      records: document.records.filter(isUploadResumeRecord),
    };
  } catch {
    return emptyDocument();
  }
}

function pruneRecords(
  records: UploadResumeRecord[],
  now: number,
): UploadResumeRecord[] {
  return records
    .filter((record) => record.expiresAt > now)
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, UPLOAD_RESUME_MAX_RECORDS);
}

function writeRecords(
  storage: UploadResumeStorage,
  records: UploadResumeRecord[],
): boolean {
  const document: ResumeDocument = { v: 1, records };

  try {
    storage.setItem(UPLOAD_RESUME_STORAGE_KEY, JSON.stringify(document));
    return true;
  } catch {
    const trimmed = records.slice(0, Math.max(1, Math.floor(records.length / 2)));
    try {
      storage.setItem(
        UPLOAD_RESUME_STORAGE_KEY,
        JSON.stringify({ v: 1, records: trimmed } satisfies ResumeDocument),
      );
      return true;
    } catch {
      return false;
    }
  }
}

export function resolveUploadResumeStorage(): UploadResumeStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readUploadResumeRecords(
  storage: UploadResumeStorage,
  now: number = Date.now(),
): UploadResumeRecord[] {
  const document = parseDocument(safeGetItem(storage));
  return pruneRecords(document.records, now);
}

function safeGetItem(storage: UploadResumeStorage): string | null {
  try {
    return storage.getItem(UPLOAD_RESUME_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function findUploadResumeRecord(
  storage: UploadResumeStorage,
  fingerprint: string,
  now: number = Date.now(),
): UploadResumeRecord | null {
  const records = readUploadResumeRecords(storage, now);
  return records.find((record) => record.fingerprint === fingerprint) ?? null;
}

export function saveUploadResumeRecord(
  storage: UploadResumeStorage,
  record: UploadResumeRecord,
): boolean {
  if (!isUploadResumeRecord(record)) return false;

  const records = readUploadResumeRecords(storage, record.updatedAt).filter(
    (existing) => existing.fingerprint !== record.fingerprint,
  );
  records.unshift(record);
  return writeRecords(
    storage,
    pruneRecords(records, record.updatedAt),
  );
}

export function removeUploadResumeRecord(
  storage: UploadResumeStorage,
  fingerprint: string,
): void {
  const records = readUploadResumeRecords(storage).filter(
    (record) => record.fingerprint !== fingerprint,
  );

  if (records.length === 0) {
    clearUploadResumeRecords(storage);
    return;
  }

  writeRecords(storage, records);
}

export function clearUploadResumeRecords(storage: UploadResumeStorage): void {
  try {
    storage.removeItem(UPLOAD_RESUME_STORAGE_KEY);
  } catch {
    // Clearing best-effort cache data must never break an upload.
  }
}

export function pruneUploadResumeRecords(
  storage: UploadResumeStorage,
  now: number = Date.now(),
): number {
  const document = parseDocument(safeGetItem(storage));
  const records = pruneRecords(document.records, now);

  if (records.length === 0) {
    clearUploadResumeRecords(storage);
  } else {
    writeRecords(storage, records);
  }

  return document.records.length - records.length;
}

export function createUploadResumeRecord(params: {
  fingerprint: string;
  roomCode: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  lastModified: number;
  session: string;
  service: UploadServiceId;
  storage: UploadStorageId;
  chunkSize: number;
  totalChunks: number;
  lastChunkBytes: number;
  expiresAt: number;
  completedChunks?: UploadChunkDescriptor[];
  now?: number;
}): UploadResumeRecord {
  const now = params.now ?? Date.now();
  return {
    v: 1,
    fingerprint: params.fingerprint,
    roomCode: params.roomCode,
    fileName: params.fileName,
    mimeType: params.mimeType,
    sizeBytes: params.sizeBytes,
    lastModified: params.lastModified,
    session: params.session,
    service: params.service,
    storage: params.storage,
    chunkSize: params.chunkSize,
    totalChunks: params.totalChunks,
    lastChunkBytes: params.lastChunkBytes,
    expiresAt: params.expiresAt,
    completedChunks: (params.completedChunks ?? []).map((chunk) => ({
      index: chunk.index,
      url: chunk.url,
      sizeBytes: chunk.sizeBytes,
    })),
    createdAt: now,
    updatedAt: now,
  };
}
