import { ApiRequestError, apiFetch } from "@/lib/client";

export type DownloadPayload = {
  url: string;
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  chunked?: boolean;
  totalChunks?: number;
  chunkSize?: number;
  integrity?: "sha256" | "none";
};

export type DownloadProgress = {
  loadedBytes: number;
  totalBytes: number;
  percent: number;
};

export type DownloadFailureDetails = {
  receivedBytes: number;
  expectedBytes: number;
  failedIndex?: number;
  /** Chunk indexes worth checking when the failure lands on a chunk boundary. */
  failedIndexes?: number[];
};

export class AttachmentDownloadError extends Error {
  readonly code: string;
  readonly details?: DownloadFailureDetails;

  constructor(code: string, message: string, details?: DownloadFailureDetails) {
    super(message);
    this.name = "AttachmentDownloadError";
    this.code = code;
    this.details = details;
  }
}

export type AttachmentIntegrityFailure = {
  index: number;
  code: string;
  message: string;
  expectedSize: number;
  actualSize?: number;
  expectedSha256?: string;
  actualSha256?: string;
};

export type AttachmentIntegrityReport = {
  valid: boolean;
  integrity: "sha256" | "none";
  totalChunks: number;
  checkedChunks: number;
  failures: AttachmentIntegrityFailure[];
  attachmentId: string;
  fileName: string;
  sizeBytes: number;
  chunkSize: number;
  canRepair: boolean;
};

export type RepairChunkResult = {
  index: number;
  url: string;
  sizeBytes: number;
  sha256: string;
  integrity: "sha256" | "none";
  mergeUrl: string;
};

export function computeCandidateChunkIndexes(
  receivedBytes: number,
  chunkSize: number,
  totalChunks: number,
): number[] {
  if (receivedBytes <= 0 || chunkSize <= 0 || totalChunks <= 0) {
    return [0];
  }

  const boundary = receivedBytes / chunkSize;
  if (Number.isInteger(boundary)) {
    const candidates = [boundary - 1, boundary].filter(
      (index) => index >= 0 && index < totalChunks,
    );
    if (candidates.length > 0) {
      return candidates;
    }
  }

  return [Math.min(totalChunks - 1, Math.floor(boundary))];
}

export function computeFailedChunkIndex(
  receivedBytes: number,
  chunkSize: number,
  totalChunks: number,
): number {
  const candidates = computeCandidateChunkIndexes(
    receivedBytes,
    chunkSize,
    totalChunks,
  );
  return candidates[candidates.length - 1] ?? 0;
}

export function downloadAttachmentMetadata(
  roomCode: string,
  attachmentId: string,
): Promise<DownloadPayload> {
  return apiFetch<DownloadPayload>(
    `/api/rooms/${encodeURIComponent(roomCode)}/attachments/${encodeURIComponent(attachmentId)}/download`,
  );
}

async function readStreamError(response: Response): Promise<AttachmentDownloadError> {
  let message = `下载失败（HTTP ${response.status}）`;
  let code = `HTTP_${response.status}`;

  try {
    const payload = (await response.json()) as {
      error?: { message?: string; code?: string };
    };
    message = payload.error?.message ?? message;
    code = payload.error?.code ?? code;
  } catch {
    // Non-JSON upstream response; keep the status-based message.
  }

  return new AttachmentDownloadError(code, message);
}

function triggerBlobDownload(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

async function readChunkedStream(
  response: Response,
  metadata: DownloadPayload,
  fileName: string,
  onProgress?: (progress: DownloadProgress) => void,
): Promise<number> {
  const totalBytes = metadata.sizeBytes ?? 0;
  const chunkSize = metadata.chunkSize ?? 0;
  const totalChunks = metadata.totalChunks ?? 0;
  const reader = response.body?.getReader();

  if (!reader) {
    throw new AttachmentDownloadError(
      "DOWNLOAD_STREAM_UNAVAILABLE",
      "浏览器无法读取下载数据流",
    );
  }

  const parts: BlobPart[] = [];
  let receivedBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      parts.push(value);
      receivedBytes += value.byteLength;
      onProgress?.({
        loadedBytes: receivedBytes,
        totalBytes,
        percent:
          totalBytes > 0
            ? Math.min(100, Math.round((receivedBytes / totalBytes) * 100))
            : 0,
      });
    }
  } catch (error) {
    if (error instanceof AttachmentDownloadError) {
      throw error;
    }

    throw new AttachmentDownloadError(
      "DOWNLOAD_STREAM_FAILED",
      "分片下载中断，文件未保存",
      {
        receivedBytes,
        expectedBytes: totalBytes,
        failedIndex: computeFailedChunkIndex(
          receivedBytes,
          chunkSize,
          totalChunks,
        ),
        failedIndexes: computeCandidateChunkIndexes(
          receivedBytes,
          chunkSize,
          totalChunks,
        ),
      },
    );
  } finally {
    reader.releaseLock();
  }

  if (receivedBytes !== totalBytes) {
    throw new AttachmentDownloadError(
      "DOWNLOAD_INCOMPLETE",
      "下载内容不完整，文件未保存",
      {
        receivedBytes,
        expectedBytes: totalBytes,
        failedIndex: computeFailedChunkIndex(
          receivedBytes,
          chunkSize,
          totalChunks,
        ),
        failedIndexes: computeCandidateChunkIndexes(
          receivedBytes,
          chunkSize,
          totalChunks,
        ),
      },
    );
  }

  triggerBlobDownload(
    new Blob(parts, { type: metadata.mimeType ?? "application/octet-stream" }),
    fileName,
  );

  return receivedBytes;
}

export async function downloadAttachment(options: {
  roomCode: string;
  attachmentId: string;
  fileName: string;
  signal?: AbortSignal;
  onProgress?: (progress: DownloadProgress) => void;
}): Promise<{ mode: "native" | "streamed"; bytes: number }> {
  const metadata = await downloadAttachmentMetadata(
    options.roomCode,
    options.attachmentId,
  );

  if (!metadata.chunked) {
    window.open(metadata.url, "_blank", "noopener,noreferrer");
    return { mode: "native", bytes: 0 };
  }

  let response: Response;
  try {
    response = await fetch(metadata.url, {
      method: "GET",
      cache: "no-store",
      credentials: "include",
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new AttachmentDownloadError("DOWNLOAD_CANCELLED", "已取消下载");
    }
    throw new AttachmentDownloadError(
      "DOWNLOAD_NETWORK_ERROR",
      "下载连接失败，请重试",
      {
        receivedBytes: 0,
        expectedBytes: metadata.sizeBytes ?? 0,
        failedIndex: 0,
      },
    );
  }

  if (!response.ok) {
    throw await readStreamError(response);
  }

  const bytes = await readChunkedStream(
    response,
    metadata,
    options.fileName || metadata.fileName || "download.bin",
    options.onProgress,
  );

  return { mode: "streamed", bytes };
}

export function checkAttachmentIntegrity(
  roomCode: string,
  attachmentId: string,
  indexes?: number[],
): Promise<AttachmentIntegrityReport> {
  const query =
    indexes && indexes.length > 0
      ? `?indexes=${indexes.map((index) => Math.max(0, Math.trunc(index))).join(",")}`
      : "";

  return apiFetch<AttachmentIntegrityReport>(
    `/api/rooms/${encodeURIComponent(roomCode)}/attachments/${encodeURIComponent(attachmentId)}/integrity${query}`,
  );
}

export function repairAttachmentChunk(options: {
  roomCode: string;
  attachmentId: string;
  index: number;
  file: File;
}): Promise<RepairChunkResult> {
  const formData = new FormData();
  formData.append("index", String(options.index));
  formData.append("file", options.file);

  return apiFetch<RepairChunkResult>(
    `/api/rooms/${encodeURIComponent(options.roomCode)}/attachments/${encodeURIComponent(options.attachmentId)}/repair`,
    { method: "POST", body: formData },
  );
}

export function downloadErrorFailedIndexes(error: unknown): number[] {
  if (error instanceof AttachmentDownloadError) {
    if (error.details?.failedIndexes?.length) {
      return error.details.failedIndexes;
    }
    return error.details?.failedIndex !== undefined
      ? [error.details.failedIndex]
      : [];
  }

  if (error instanceof ApiRequestError) {
    const details = error.details as { chunkIndex?: unknown } | undefined;
    return typeof details?.chunkIndex === "number"
      ? [details.chunkIndex]
      : [];
  }

  return [];
}

export function downloadErrorFailedIndex(error: unknown): number | undefined {
  return downloadErrorFailedIndexes(error)[0];
}
