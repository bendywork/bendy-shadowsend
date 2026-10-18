/**
 * Bridge between the persisted attachment model (`chunkManifest` JSONB) and
 * the upload manifest used by the receiver-side merge stream.
 */

import { ApiError } from "@/lib/api";
import {
  parseAttachmentChunkManifest,
  type AttachmentChunkManifest,
  type RemoteAttachmentStorage,
} from "@/lib/attachment-storage";
import { manifestIntegrity, normalizeSha256 } from "@/lib/upload/hash";
import type { UploadManifest, UploadServiceId } from "@/lib/upload/types";

export type BuildableAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number | bigint;
  storage: string;
  chunkManifest: unknown;
};

function serviceForStorage(storage: RemoteAttachmentStorage): UploadServiceId {
  return storage === "SANG" ? "sang" : "pic-sl";
}

function toNumber(value: number | bigint): number {
  return typeof value === "bigint" ? Number(value) : value;
}

export function buildAttachmentMergeManifest(
  attachment: BuildableAttachment,
): UploadManifest {
  const storage = attachment.storage;
  if (storage !== "SANG" && storage !== "PIC_SL") {
    throw new ApiError(
      409,
      "附件不是可合并的远端分片附件",
      "CHUNKED_ATTACHMENT_STORAGE_INVALID",
    );
  }

  const manifest: AttachmentChunkManifest | null = parseAttachmentChunkManifest(
    attachment.chunkManifest,
    storage,
  );

  if (!manifest) {
    throw new ApiError(
      409,
      "分片清单无效，无法合并下载",
      "CHUNKED_MANIFEST_INVALID",
    );
  }

  const chunkTotal = manifest.chunks.reduce(
    (sum, chunk) => sum + chunk.sizeBytes,
    0,
  );
  const attachmentSize = toNumber(attachment.sizeBytes);

  if (
    !Number.isSafeInteger(attachmentSize) ||
    attachmentSize <= 0 ||
    attachmentSize !== chunkTotal ||
    (manifest.sizeBytes !== undefined && manifest.sizeBytes !== attachmentSize)
  ) {
    throw new ApiError(
      409,
      "分片清单与附件大小不一致",
      "CHUNKED_MANIFEST_SIZE_MISMATCH",
    );
  }

  return {
    uploadId: manifest.uploadId ?? attachment.id,
    service: serviceForStorage(storage),
    storage,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    sizeBytes: attachmentSize,
    chunkSize: manifest.chunkSize,
    totalChunks: manifest.totalChunks,
    chunks: manifest.chunks.map((chunk) => ({
      index: chunk.index,
      url: chunk.url,
      sizeBytes: chunk.sizeBytes,
      sha256: normalizeSha256(chunk.sha256) ?? undefined,
    })),
  };
}

export function attachmentIntegrity(
  attachment: Pick<BuildableAttachment, "chunkManifest" | "storage">,
): "sha256" | "none" {
  if (attachment.storage !== "SANG" && attachment.storage !== "PIC_SL") {
    return "none";
  }

  const manifest = parseAttachmentChunkManifest(
    attachment.chunkManifest,
    attachment.storage,
  );

  return manifest ? manifestIntegrity(manifest.chunks) : "none";
}
