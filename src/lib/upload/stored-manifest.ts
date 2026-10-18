import { parseAttachmentChunkManifest } from "@/lib/attachment-storage";
import { UPLOAD_MAX_CHUNKS } from "@/lib/upload/constants";
import { isAllowedRemoteUrl } from "@/lib/upload/remote/urls";
import type {
  UploadChunkDescriptor,
  UploadManifest,
  UploadServiceId,
  UploadStorageId,
} from "@/lib/upload/types";

export type RemoteAttachment =
  | { kind: "url"; url: string }
  | { kind: "manifest"; manifest: UploadManifest };

const STORAGE_SERVICE: Record<UploadStorageId, UploadServiceId> = {
  SANG: "sang",
  PIC_SL: "pic-sl",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readPositiveInt(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : null;
}

function readStorage(value: unknown): UploadStorageId | null {
  return value === "SANG" || value === "PIC_SL" ? value : null;
}

function readService(value: unknown): UploadServiceId | null {
  return value === "sang" || value === "pic-sl" ? value : null;
}

function readChunk(
  value: unknown,
  service: UploadServiceId,
): UploadChunkDescriptor | null {
  if (!isRecord(value)) return null;

  const index =
    typeof value.index === "number" &&
    Number.isSafeInteger(value.index) &&
    value.index >= 0
      ? value.index
      : null;
  const url = readString(value.url);
  const sizeBytes = readPositiveInt(value.sizeBytes);

  if (index === null || !url || sizeBytes === null) return null;
  if (!isAllowedRemoteUrl(service, url)) return null;

  return { index, url, sizeBytes };
}

function readChunks(
  value: unknown,
  service: UploadServiceId,
  totalChunks: number,
): UploadChunkDescriptor[] | null {
  if (!Array.isArray(value) || value.length !== totalChunks) return null;

  const chunks = value.map((chunk) => readChunk(chunk, service));
  if (chunks.some((chunk) => chunk === null)) return null;

  const normalized = (chunks as UploadChunkDescriptor[])
    .slice()
    .sort((left, right) => left.index - right.index);

  const indexesMatch = normalized.every((chunk, index) => chunk.index === index);
  return indexesMatch ? normalized : null;
}

export function parseStoredUploadManifest(value: string): UploadManifest | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{")) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    return null;
  }

  if (!isRecord(raw)) return null;

  const uploadId = readString(raw.uploadId);
  const service = readService(raw.service);
  const storage = readStorage(raw.storage);
  const fileName = readString(raw.fileName);
  const mimeType = readString(raw.mimeType);
  const sizeBytes = readPositiveInt(raw.sizeBytes);
  const chunkSize = readPositiveInt(raw.chunkSize);
  const totalChunks = readPositiveInt(raw.totalChunks);

  if (
    !uploadId ||
    !service ||
    !storage ||
    !fileName ||
    !mimeType ||
    sizeBytes === null ||
    chunkSize === null ||
    totalChunks === null ||
    totalChunks > UPLOAD_MAX_CHUNKS ||
    STORAGE_SERVICE[storage] !== service
  ) {
    return null;
  }

  if (sizeBytes > chunkSize * totalChunks) return null;
  if (sizeBytes <= chunkSize * (totalChunks - 1)) return null;

  const chunks = readChunks(raw.chunks, service, totalChunks);
  if (!chunks) return null;

  const totalChunkBytes = chunks.reduce((sum, chunk) => sum + chunk.sizeBytes, 0);
  if (totalChunkBytes !== sizeBytes) return null;

  return {
    uploadId,
    service,
    storage,
    fileName,
    mimeType,
    sizeBytes,
    chunkSize,
    totalChunks,
    chunks,
  };
}

export function serializeStoredUploadManifest(manifest: UploadManifest): string {
  return JSON.stringify(manifest);
}

export function resolveRemoteAttachment(
  storage: string,
  s3Key: string,
): RemoteAttachment | null {
  const typedStorage = readStorage(storage);
  if (!typedStorage) return null;

  const service = STORAGE_SERVICE[typedStorage];
  const trimmed = s3Key.trim();

  if (trimmed.startsWith("{")) {
    const manifest = parseStoredUploadManifest(trimmed);
    if (!manifest || manifest.service !== service) return null;
    return { kind: "manifest", manifest };
  }

  return isAllowedRemoteUrl(service, trimmed)
    ? { kind: "url", url: trimmed }
    : null;
}

/**
 * Resolve a persisted attachment from the current storage model:
 * `chunkManifest` (JSONB) is authoritative, while `s3Key` keeps the direct URL
 * or the first chunk URL. Serialized manifests in `s3Key` remain readable for
 * attachments created before the chunkManifest column was populated.
 */
export function resolveStoredRemoteAttachment(params: {
  storage: unknown;
  s3Key: string;
  chunkManifest?: unknown;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}): RemoteAttachment | null {
  const typedStorage = readStorage(params.storage);
  if (!typedStorage) return null;

  const service = STORAGE_SERVICE[typedStorage];

  if (params.chunkManifest !== null && params.chunkManifest !== undefined) {
    const parsed = parseAttachmentChunkManifest(
      params.chunkManifest,
      typedStorage,
    );

    if (!parsed || parsed.chunks[0]?.url !== params.s3Key) {
      return null;
    }

    const chunkTotal = parsed.chunks.reduce(
      (sum, chunk) => sum + chunk.sizeBytes,
      0,
    );

    if (chunkTotal !== params.sizeBytes) {
      return null;
    }

    return {
      kind: "manifest",
      manifest: {
        uploadId: parsed.uploadId ?? "stored",
        service,
        storage: typedStorage,
        fileName: params.fileName,
        mimeType: params.mimeType,
        sizeBytes: params.sizeBytes,
        chunkSize: parsed.chunkSize,
        totalChunks: parsed.totalChunks,
        chunks: parsed.chunks,
      },
    };
  }

  const remote = resolveRemoteAttachment(typedStorage, params.s3Key);

  if (remote?.kind === "manifest" && remote.manifest.sizeBytes !== params.sizeBytes) {
    return null;
  }

  return remote;
}
