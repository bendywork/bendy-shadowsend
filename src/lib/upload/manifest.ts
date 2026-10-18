import { ApiError } from "@/lib/api";
import { UPLOAD_MAX_CHUNKS } from "@/lib/upload/constants";
import { createChunkPlan } from "@/lib/upload/plan";
import { isAllowedRemoteUrl } from "@/lib/upload/remote/urls";
import type {
  UploadChunkDescriptor,
  UploadManifest,
  UploadSessionPayload,
} from "@/lib/upload/types";

export type UploadChunkInput = {
  index: number;
  url: string;
  sizeBytes: number;
};

function assertChunkShape(
  chunk: UploadChunkInput,
  position: number,
): void {
  if (!Number.isSafeInteger(chunk.index) || chunk.index < 0) {
    throw new ApiError(400, "分片索引无效", "UPLOAD_CHUNK_INDEX_INVALID");
  }

  if (!Number.isSafeInteger(chunk.sizeBytes) || chunk.sizeBytes <= 0) {
    throw new ApiError(400, "分片大小无效", "UPLOAD_CHUNK_SIZE_INVALID");
  }

  if (chunk.index !== position) {
    throw new ApiError(400, "分片顺序或数量不完整", "UPLOAD_CHUNK_ORDER_INVALID");
  }
}

export function expectedChunkBytes(
  session: UploadSessionPayload,
  index: number,
): number {
  if (index < 0 || index >= session.totalChunks) {
    throw new ApiError(400, "分片索引超出范围", "UPLOAD_CHUNK_INDEX_INVALID");
  }

  const plan = createChunkPlan(session.totalBytes, session.chunkSize);
  return index === session.totalChunks - 1
    ? plan.lastChunkBytes
    : session.chunkSize;
}

export function buildUploadManifest(
  session: UploadSessionPayload,
  chunks: UploadChunkInput[],
): UploadManifest {
  if (!Array.isArray(chunks) || chunks.length !== session.totalChunks) {
    throw new ApiError(
      400,
      `分片数量不匹配，应为 ${session.totalChunks} 片`,
      "UPLOAD_CHUNK_COUNT_MISMATCH",
    );
  }

  if (session.totalChunks > UPLOAD_MAX_CHUNKS) {
    throw new ApiError(400, "分片数量超出上限", "UPLOAD_TOO_MANY_CHUNKS");
  }

  const ordered: UploadChunkDescriptor[] = chunks.map((chunk, position) => {
    assertChunkShape(chunk, position);

    if (!isAllowedRemoteUrl(session.service, chunk.url)) {
      throw new ApiError(400, "分片地址不受信任", "UPLOAD_CHUNK_URL_INVALID");
    }

    const expected = expectedChunkBytes(session, chunk.index);
    if (chunk.sizeBytes !== expected) {
      throw new ApiError(400, "分片大小与上传会话不一致", "UPLOAD_CHUNK_SIZE_MISMATCH");
    }

    return {
      index: chunk.index,
      url: chunk.url,
      sizeBytes: chunk.sizeBytes,
    };
  });

  return {
    uploadId: session.sid,
    service: session.service,
    storage: session.storage,
    fileName: session.fileName,
    mimeType: session.mimeType,
    sizeBytes: session.totalBytes,
    chunkSize: session.chunkSize,
    totalChunks: session.totalChunks,
    chunks: ordered,
  };
}
