/**
 * Attachment storage model helpers.
 *
 * Persisted `MessageAttachment.storage` values:
 * - SANG / PIC_SL: third-party remote storage (public HTTPS URL in `s3Key`).
 *
 * Chunked uploads keep the first chunk URL in `s3Key` and persist the full
 * manifest in `MessageAttachment.chunkManifest` (JSONB). No extra table.
 */

export const ATTACHMENT_STORAGE_VALUES = ["SANG", "PIC_SL"] as const;

export type AttachmentStorageValue = (typeof ATTACHMENT_STORAGE_VALUES)[number];

export type RemoteAttachmentStorage = "SANG" | "PIC_SL";

export const REMOTE_ATTACHMENT_STORAGES: readonly RemoteAttachmentStorage[] = [
  "SANG",
  "PIC_SL",
];

export const MAX_ATTACHMENT_CHUNKS = 50;
export const MAX_REMOTE_ATTACHMENT_URL_LENGTH = 2048;

const REMOTE_HOST_SUFFIXES: Record<RemoteAttachmentStorage, readonly string[]> =
  {
    SANG: ["meitudata.com", "icve.com.cn", "sang.pub"],
    PIC_SL: ["pic.sl.al"],
  };

export type AttachmentChunk = {
  index: number;
  url: string;
  sizeBytes: number;
};

export type AttachmentChunkManifest = {
  uploadId?: string;
  chunkSize: number;
  totalChunks: number;
  sizeBytes?: number;
  chunks: AttachmentChunk[];
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function matchesHost(host: string, suffixes: readonly string[]) {
  return suffixes.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}

function isHttpsUrl(value: string) {
  if (value.length === 0 || value.length > MAX_REMOTE_ATTACHMENT_URL_LENGTH) {
    return false;
  }

  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export function isAttachmentStorageValue(
  value: unknown,
): value is AttachmentStorageValue {
  return (
    typeof value === "string" &&
    (ATTACHMENT_STORAGE_VALUES as readonly string[]).includes(value)
  );
}

export function isRemoteAttachmentStorage(
  value: unknown,
): value is RemoteAttachmentStorage {
  return (
    typeof value === "string" &&
    (REMOTE_ATTACHMENT_STORAGES as readonly string[]).includes(value)
  );
}

export function isAllowedRemoteAttachmentUrl(
  storage: unknown,
  value: unknown,
): boolean {
  if (!isRemoteAttachmentStorage(storage) || typeof value !== "string") {
    return false;
  }

  if (!isHttpsUrl(value)) {
    return false;
  }

  const host = new URL(value).hostname.toLowerCase();
  return matchesHost(host, REMOTE_HOST_SUFFIXES[storage]);
}

export function parseAttachmentChunkManifest(
  value: unknown,
  storage?: unknown,
): AttachmentChunkManifest | null {
  if (!isPlainObject(value)) {
    return null;
  }

  if (storage !== undefined && !isRemoteAttachmentStorage(storage)) {
    return null;
  }

  const { chunkSize, totalChunks, chunks, sizeBytes, uploadId } = value;

  if (
    !isPositiveInteger(chunkSize) ||
    !isPositiveInteger(totalChunks) ||
    totalChunks > MAX_ATTACHMENT_CHUNKS ||
    !Array.isArray(chunks) ||
    chunks.length !== totalChunks
  ) {
    return null;
  }

  const normalizedChunks: AttachmentChunk[] = [];
  let chunkTotal = 0;

  for (let position = 0; position < chunks.length; position += 1) {
    const chunk = chunks[position];

    if (
      !isPlainObject(chunk) ||
      chunk.index !== position ||
      !isPositiveInteger(chunk.sizeBytes) ||
      typeof chunk.url !== "string"
    ) {
      return null;
    }

    if (
      storage !== undefined
        ? !isAllowedRemoteAttachmentUrl(storage, chunk.url)
        : !isHttpsUrl(chunk.url)
    ) {
      return null;
    }

    const isLastChunk = position === chunks.length - 1;
    if (!isLastChunk && chunk.sizeBytes !== chunkSize) {
      return null;
    }

    if (isLastChunk && chunk.sizeBytes > chunkSize) {
      return null;
    }

    chunkTotal += chunk.sizeBytes;
    normalizedChunks.push({
      index: position,
      url: chunk.url,
      sizeBytes: chunk.sizeBytes,
    });
  }

  if (sizeBytes !== undefined) {
    if (!isPositiveInteger(sizeBytes) || sizeBytes !== chunkTotal) {
      return null;
    }
  }

  if (
    storage !== undefined &&
    value.storage !== undefined &&
    value.storage !== storage
  ) {
    return null;
  }

  if (
    uploadId !== undefined &&
    (typeof uploadId !== "string" ||
      uploadId.length === 0 ||
      uploadId.length > 200)
  ) {
    return null;
  }

  return {
    uploadId: typeof uploadId === "string" ? uploadId : undefined,
    chunkSize,
    totalChunks,
    sizeBytes: typeof sizeBytes === "number" ? sizeBytes : undefined,
    chunks: normalizedChunks,
  };
}

export function isChunkedAttachment(value: unknown, storage?: unknown) {
  return parseAttachmentChunkManifest(value, storage) !== null;
}

export type AttachmentReadMode = "remote" | "chunked";

export function resolveAttachmentReadMode(
  storage: unknown,
  chunkManifest?: unknown,
): AttachmentReadMode | null {
  if (!isRemoteAttachmentStorage(storage)) {
    return null;
  }

  if (chunkManifest === null || chunkManifest === undefined) {
    return "remote";
  }

  return isChunkedAttachment(chunkManifest, storage) ? "chunked" : null;
}
