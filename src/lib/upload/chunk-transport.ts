import type {
  UploadChunkDescriptor,
  UploadManifest,
  UploadServiceId,
  UploadStorageId,
} from "@/lib/upload/types";
import { storageForService } from "@/lib/upload/types";

export type UploadSessionInfo = {
  session: string;
  service: UploadServiceId;
  storage: UploadStorageId;
  chunkSize: number;
  totalChunks: number;
  lastChunkBytes: number;
  expiresAt: number;
};

export type CompletedUpload = UploadManifest & {
  mergeToken: string;
  mergeUrl: string;
};

export type UploadChunkRequest = {
  session: string;
  index: number;
  blob: Blob;
  signal?: AbortSignal;
  onProgress?: (loadedBytes: number) => void;
};

export type ChunkTransport = {
  createSession: (
    file: File,
    options?: { signal?: AbortSignal },
  ) => Promise<UploadSessionInfo>;
  uploadChunk: (input: UploadChunkRequest) => Promise<UploadChunkDescriptor>;
  completeSession: (input: {
    session: string;
    chunks: UploadChunkDescriptor[];
    signal?: AbortSignal;
  }) => Promise<CompletedUpload>;
};

export class ChunkTransportError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryable: boolean;

  constructor(
    message: string,
    options: {
      code?: string;
      status?: number;
      retryable?: boolean;
    } = {},
  ) {
    super(message);
    this.name = "ChunkTransportError";
    this.code = options.code ?? "UPLOAD_REQUEST_FAILED";
    this.status = options.status ?? 0;
    this.retryable = options.retryable ?? false;
  }
}

type JsonEnvelope = {
  ok?: boolean;
  data?: unknown;
  error?: { message?: string; code?: string };
};

type RelayTransportDeps = {
  fetchImpl?: typeof fetch;
  xhrFactory?: () => XMLHttpRequest;
};

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function abortError(): ChunkTransportError {
  return new ChunkTransportError("上传已取消", {
    code: "UPLOAD_ABORTED",
    retryable: false,
  });
}

function networkError(error: unknown): ChunkTransportError {
  if (error instanceof ChunkTransportError) return error;
  if (error instanceof DOMException && error.name === "AbortError") {
    return abortError();
  }
  return new ChunkTransportError(
    error instanceof Error ? error.message : "网络请求失败",
    { code: "UPLOAD_NETWORK_ERROR", retryable: true },
  );
}

function parseEnvelope(text: string): JsonEnvelope {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === "object" ? (parsed as JsonEnvelope) : {};
  } catch {
    return {};
  }
}

function envelopeError(envelope: JsonEnvelope, status: number): ChunkTransportError {
  const message = envelope.error?.message || `上传请求失败（${status}）`;
  return new ChunkTransportError(message, {
    code: envelope.error?.code ?? "UPLOAD_REQUEST_FAILED",
    status,
    retryable: isRetryableStatus(status),
  });
}

function unwrapEnvelope(text: string, status: number): unknown {
  const envelope = parseEnvelope(text);
  if (status < 200 || status >= 300 || envelope.ok !== true) {
    throw envelopeError(envelope, status);
  }
  return envelope.data;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function invalidResponse(message: string): ChunkTransportError {
  return new ChunkTransportError(message, {
    code: "UPLOAD_RESPONSE_INVALID",
    retryable: false,
  });
}

function parseSessionInfo(data: unknown): UploadSessionInfo {
  if (!data || typeof data !== "object") {
    throw invalidResponse("上传会话响应无效");
  }
  const value = data as Record<string, unknown>;

  if (!isNonEmptyString(value.session)) throw invalidResponse("上传会话缺失");
  if (value.service !== "sang" && value.service !== "pic-sl") {
    throw invalidResponse("上传服务无效");
  }
  if (value.storage !== "SANG" && value.storage !== "PIC_SL") {
    throw invalidResponse("上传存储标识无效");
  }
  if (value.storage !== storageForService(value.service)) {
    throw invalidResponse("上传存储标识不匹配");
  }

  const numeric = ["chunkSize", "totalChunks", "lastChunkBytes", "expiresAt"] as const;
  for (const field of numeric) {
    if (!isPositiveInteger(value[field])) throw invalidResponse("上传会话数值无效");
  }

  return {
    session: value.session,
    service: value.service,
    storage: value.storage,
    chunkSize: value.chunkSize as number,
    totalChunks: value.totalChunks as number,
    lastChunkBytes: value.lastChunkBytes as number,
    expiresAt: value.expiresAt as number,
  };
}

function parseChunkDescriptor(
  data: unknown,
  expectedIndex: number,
): UploadChunkDescriptor {
  if (!data || typeof data !== "object") {
    throw invalidResponse("分片响应无效");
  }
  const value = data as Record<string, unknown>;
  if (value.index !== expectedIndex) throw invalidResponse("分片索引不匹配");
  if (!isNonEmptyString(value.url)) throw invalidResponse("分片地址缺失");
  if (!isPositiveInteger(value.sizeBytes)) throw invalidResponse("分片大小无效");

  return {
    index: expectedIndex,
    url: value.url,
    sizeBytes: value.sizeBytes,
  };
}

function parseCompletedUpload(data: unknown): CompletedUpload {
  if (!data || typeof data !== "object") {
    throw invalidResponse("合并响应无效");
  }
  const value = data as Record<string, unknown>;

  if (!isNonEmptyString(value.uploadId)) throw invalidResponse("上传标识缺失");
  if (!isNonEmptyString(value.mergeToken)) throw invalidResponse("合并令牌缺失");
  if (!isNonEmptyString(value.mergeUrl)) throw invalidResponse("合并地址缺失");
  if (!Array.isArray(value.chunks)) throw invalidResponse("分片清单缺失");
  if (!isPositiveInteger(value.sizeBytes)) throw invalidResponse("文件大小无效");
  if (!isPositiveInteger(value.chunkSize)) throw invalidResponse("分片大小无效");
  if (!isPositiveInteger(value.totalChunks)) throw invalidResponse("分片数量无效");
  if (value.chunks.length !== value.totalChunks) {
    throw invalidResponse("分片清单不完整");
  }

  if (value.service !== "sang" && value.service !== "pic-sl") {
    throw invalidResponse("上传服务无效");
  }
  if (value.storage !== "SANG" && value.storage !== "PIC_SL") {
    throw invalidResponse("上传存储标识无效");
  }
  if (value.storage !== storageForService(value.service)) {
    throw invalidResponse("上传存储标识不匹配");
  }
  if (!isNonEmptyString(value.fileName)) throw invalidResponse("文件名缺失");
  if (typeof value.mimeType !== "string") throw invalidResponse("文件类型无效");

  const chunks = value.chunks.map((chunk, position) =>
    parseChunkDescriptor(chunk, position),
  );

  return {
    uploadId: value.uploadId,
    service: value.service,
    storage: value.storage,
    fileName: value.fileName,
    mimeType: value.mimeType,
    sizeBytes: value.sizeBytes,
    chunkSize: value.chunkSize,
    totalChunks: value.totalChunks,
    chunks,
    mergeToken: value.mergeToken,
    mergeUrl: value.mergeUrl,
  };
}

async function postJson(
  fetchImpl: typeof fetch,
  url: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<unknown> {
  if (signal?.aborted) throw abortError();

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
      signal,
    });
  } catch (error) {
    throw networkError(error);
  }

  return unwrapEnvelope(await response.text(), response.status);
}

function postChunkWithXhr(
  xhrFactory: () => XMLHttpRequest,
  url: string,
  formData: FormData,
  input: UploadChunkRequest,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (input.signal?.aborted) {
      reject(abortError());
      return;
    }

    const xhr = xhrFactory();
    const onAbort = () => xhr.abort();

    xhr.open("POST", url, true);
    xhr.withCredentials = true;

    if (input.onProgress) {
      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        try {
          input.onProgress?.(event.loaded);
        } catch {
          // Progress rendering must never abort an upload.
        }
      };
    }

    xhr.onload = () => {
      input.signal?.removeEventListener("abort", onAbort);
      try {
        resolve(unwrapEnvelope(xhr.responseText, xhr.status));
      } catch (error) {
        reject(error);
      }
    };

    xhr.onerror = () => {
      input.signal?.removeEventListener("abort", onAbort);
      reject(
        new ChunkTransportError("网络请求失败", {
          code: "UPLOAD_NETWORK_ERROR",
          retryable: true,
        }),
      );
    };

    xhr.onabort = () => {
      input.signal?.removeEventListener("abort", onAbort);
      reject(abortError());
    };

    input.signal?.addEventListener("abort", onAbort, { once: true });
    xhr.send(formData);
  });
}

function buildChunkFormData(input: UploadChunkRequest): FormData {
  const formData = new FormData();
  formData.append("session", input.session);
  formData.append("chunkIndex", String(input.index));
  formData.append("file", input.blob, `chunk-${input.index}.bin`);
  return formData;
}

export function createRelayChunkTransport(
  roomCode: string,
  deps: RelayTransportDeps = {},
): ChunkTransport {
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const xhrFactory =
    deps.xhrFactory ??
    (() => {
      if (typeof XMLHttpRequest === "undefined") {
        throw new ChunkTransportError("当前环境不支持分片上传", {
          code: "UPLOAD_XHR_UNAVAILABLE",
          retryable: false,
        });
      }
      return new XMLHttpRequest();
    });

  const basePath = `/api/rooms/${encodeURIComponent(roomCode)}/upload/sessions`;

  return {
    async createSession(file, requestOptions) {
      const data = await postJson(
        fetchImpl,
        basePath,
        {
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
        },
        requestOptions?.signal,
      );
      return parseSessionInfo(data);
    },

    async uploadChunk(input) {
      const formData = buildChunkFormData(input);
      let data: unknown;
      try {
        data = await postChunkWithXhr(
          xhrFactory,
          `${basePath}/chunk`,
          formData,
          input,
        );
      } catch (error) {
        throw networkError(error);
      }
      return parseChunkDescriptor(data, input.index);
    },

    async completeSession(input) {
      const data = await postJson(
        fetchImpl,
        `${basePath}/complete`,
        { session: input.session, chunks: input.chunks },
        input.signal,
      );
      return parseCompletedUpload(data);
    },
  };
}
