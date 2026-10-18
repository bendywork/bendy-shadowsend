import { UPLOAD_MAX_CHUNKS, UPLOAD_SINGLE_REQUEST_MAX_BYTES } from "@/lib/upload/constants";
import { isAllowedRemoteUrl } from "@/lib/upload/remote/urls";
import { parseStoredUploadManifest } from "@/lib/upload/stored-manifest";
import type {
  UploadChunkDescriptor,
  UploadManifest,
  UploadStorageId,
} from "@/lib/upload/types";

export type UploadClientMessages = {
  networkError: string;
  timeout: string;
  invalidResponse: string;
  uploadFailed: (fileName: string) => string;
};

export type RelayUploadResult = {
  s3Key: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storage: UploadStorageId;
  previewUrl: string | null;
  chunked: boolean;
  chunkManifest: UploadManifest | null;
};

type UploadEnvelope<T> = {
  ok?: boolean;
  data?: T;
  error?: {
    message?: string;
    code?: string;
  };
};

type SessionResponse = {
  session: string;
  storage: UploadStorageId;
  chunkSize: number;
  totalChunks: number;
  lastChunkBytes: number;
};

type SingleResponse = {
  storage: UploadStorageId;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
};

export class UploadRequestError extends Error {
  readonly code: string;
  readonly status?: number;
  readonly retryable: boolean;

  constructor(
    message: string,
    options: { code: string; status?: number; retryable: boolean },
  ) {
    super(message);
    this.name = "UploadRequestError";
    this.code = options.code;
    this.status = options.status;
    this.retryable = options.retryable;
  }
}

const RETRYABLE_STATUSES = new Set([
  408, 409, 429, 500, 502, 503, 504, 520, 522, 524,
]);

const UPLOAD_TIMEOUT_MS = 120_000;

export function isRetryableUploadStatus(status: number): boolean {
  return RETRYABLE_STATUSES.has(status);
}

function parseEnvelope<T>(text: string): UploadEnvelope<T> | null {
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return value as UploadEnvelope<T>;
  } catch {
    return null;
  }
}

function isStorage(value: unknown): value is UploadStorageId {
  return value === "SANG" || value === "PIC_SL";
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isPreviewable(mimeType: string): boolean {
  const normalized = mimeType.toLowerCase();
  return normalized.startsWith("image/") || normalized.startsWith("video/");
}

function invalidResponse(
  status: number,
  messages: UploadClientMessages,
): UploadRequestError {
  return new UploadRequestError(messages.invalidResponse, {
    code: "UPLOAD_INVALID_RESPONSE",
    status,
    retryable: isRetryableUploadStatus(status),
  });
}

type MultipartRequestInput = {
  url: string;
  body: FormData;
  fileName: string;
  messages: UploadClientMessages;
  signal?: AbortSignal;
  onProgress?: (ratio: number) => void;
};

function postMultipart(
  input: MultipartRequestInput,
): Promise<UploadEnvelope<unknown>> {
  const { url, body, fileName, messages, signal, onProgress } = input;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    xhr.withCredentials = true;
    xhr.timeout = UPLOAD_TIMEOUT_MS;

    const onAbort = () => xhr.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    const cleanup = () => signal?.removeEventListener("abort", onAbort);

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || !onProgress || event.total <= 0) return;
      onProgress(event.loaded / event.total);
    };

    xhr.onerror = () => {
      cleanup();
      reject(
        new UploadRequestError(messages.networkError, {
          code: "UPLOAD_NETWORK_ERROR",
          retryable: true,
        }),
      );
    };

    xhr.ontimeout = () => {
      cleanup();
      reject(
        new UploadRequestError(messages.timeout, {
          code: "UPLOAD_TIMEOUT",
          retryable: true,
        }),
      );
    };

    xhr.onabort = () => {
      cleanup();
      reject(
        new UploadRequestError(messages.uploadFailed(fileName), {
          code: "UPLOAD_ABORTED",
          retryable: false,
        }),
      );
    };

    xhr.onload = () => {
      cleanup();
      const envelope = parseEnvelope<unknown>(xhr.responseText);
      if (!envelope) {
        reject(invalidResponse(xhr.status, messages));
        return;
      }

      if (xhr.status >= 200 && xhr.status < 300 && envelope.ok) {
        resolve(envelope);
        return;
      }

      reject(
        new UploadRequestError(
          envelope.error?.message ?? messages.uploadFailed(fileName),
          {
            code: envelope.error?.code ?? "UPLOAD_REQUEST_FAILED",
            status: xhr.status,
            retryable: isRetryableUploadStatus(xhr.status),
          },
        ),
      );
    };

    xhr.send(body);
  });
}

async function postJson<T>(params: {
  url: string;
  body: unknown;
  fileName: string;
  messages: UploadClientMessages;
  signal?: AbortSignal;
}): Promise<T> {
  const { url, body, fileName, messages, signal } = params;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "include",
      cache: "no-store",
      signal,
    });
  } catch {
    throw new UploadRequestError(messages.networkError, {
      code: "UPLOAD_NETWORK_ERROR",
      retryable: true,
    });
  }

  const text = await response.text();
  const envelope = parseEnvelope<T>(text);

  if (!envelope) throw invalidResponse(response.status, messages);

  if (!response.ok || !envelope.ok || envelope.data === undefined) {
    throw new UploadRequestError(
      envelope.error?.message ?? messages.uploadFailed(fileName),
      {
        code: envelope.error?.code ?? "UPLOAD_REQUEST_FAILED",
        status: response.status,
        retryable: isRetryableUploadStatus(response.status),
      },
    );
  }

  return envelope.data;
}

function readSingleResponse(
  data: unknown,
  messages: UploadClientMessages,
): SingleResponse {
  if (!data || typeof data !== "object") {
    throw new UploadRequestError(messages.invalidResponse, {
      code: "UPLOAD_INVALID_RESPONSE",
      retryable: true,
    });
  }

  const value = data as Record<string, unknown>;
  if (
    !isStorage(value.storage) ||
    typeof value.fileName !== "string" ||
    typeof value.mimeType !== "string" ||
    !isPositiveInt(value.sizeBytes) ||
    typeof value.url !== "string" ||
    !isAllowedRemoteUrl(value.storage === "SANG" ? "sang" : "pic-sl", value.url)
  ) {
    throw new UploadRequestError(messages.invalidResponse, {
      code: "UPLOAD_INVALID_RESPONSE",
      retryable: true,
    });
  }

  return {
    storage: value.storage,
    fileName: value.fileName,
    mimeType: value.mimeType,
    sizeBytes: value.sizeBytes,
    url: value.url,
  };
}

function readSessionResponse(
  data: unknown,
  messages: UploadClientMessages,
): SessionResponse {
  if (!data || typeof data !== "object") {
    throw new UploadRequestError(messages.invalidResponse, {
      code: "UPLOAD_INVALID_RESPONSE",
      retryable: true,
    });
  }

  const value = data as Record<string, unknown>;
  if (
    typeof value.session !== "string" ||
    !value.session ||
    !isStorage(value.storage) ||
    !isPositiveInt(value.chunkSize) ||
    !isPositiveInt(value.totalChunks) ||
    value.totalChunks > UPLOAD_MAX_CHUNKS ||
    !isPositiveInt(value.lastChunkBytes)
  ) {
    throw new UploadRequestError(messages.invalidResponse, {
      code: "UPLOAD_INVALID_RESPONSE",
      retryable: true,
    });
  }

  return {
    session: value.session,
    storage: value.storage,
    chunkSize: value.chunkSize,
    totalChunks: value.totalChunks,
    lastChunkBytes: value.lastChunkBytes,
  };
}

async function uploadSingle(params: {
  url: string;
  roomCode: string;
  file: File;
  messages: UploadClientMessages;
  signal?: AbortSignal;
  onProgress?: (percent: number) => void;
}): Promise<RelayUploadResult> {
  const { url, file, messages, signal, onProgress } = params;
  const formData = new FormData();
  formData.append("file", file, file.name);

  const envelope = await postMultipart({
    url,
    body: formData,
    fileName: file.name,
    messages,
    signal,
    onProgress: (ratio) => onProgress?.(Math.round(ratio * 100)),
  });

  const data = readSingleResponse(envelope.data, messages);
  onProgress?.(100);

  return {
    s3Key: data.url,
    fileName: data.fileName,
    mimeType: data.mimeType,
    sizeBytes: data.sizeBytes,
    storage: data.storage,
    previewUrl: isPreviewable(data.mimeType) ? data.url : null,
    chunked: false,
    chunkManifest: null,
  };
}

async function uploadChunk(params: {
  baseUrl: string;
  file: File;
  session: SessionResponse;
  index: number;
  messages: UploadClientMessages;
  signal?: AbortSignal;
  onProgress?: (percent: number) => void;
}): Promise<UploadChunkDescriptor> {
  const { baseUrl, file, session, index, messages, signal, onProgress } = params;
  const start = index * session.chunkSize;
  const end = Math.min(start + session.chunkSize, file.size);
  const chunk = file.slice(start, end);

  const formData = new FormData();
  formData.append("session", session.session);
  formData.append("chunkIndex", String(index));
  formData.append("file", chunk, file.name);

  const envelope = await postMultipart({
    url: `${baseUrl}/sessions/chunk`,
    body: formData,
    fileName: file.name,
    messages,
    signal,
    onProgress: (ratio) => {
      const uploaded = start + ratio * (end - start);
      onProgress?.(Math.round((uploaded / file.size) * 100));
    },
  });

  const data = envelope.data as Record<string, unknown> | undefined;
  if (
    !data ||
    data.index !== index ||
    typeof data.url !== "string" ||
    data.sizeBytes !== end - start ||
    !isAllowedRemoteUrl(
      session.storage === "SANG" ? "sang" : "pic-sl",
      data.url,
    )
  ) {
    throw new UploadRequestError(messages.invalidResponse, {
      code: "UPLOAD_INVALID_RESPONSE",
      retryable: true,
    });
  }

  return { index, url: data.url, sizeBytes: data.sizeBytes };
}

async function uploadChunked(params: {
  baseUrl: string;
  file: File;
  messages: UploadClientMessages;
  signal?: AbortSignal;
  onProgress?: (percent: number) => void;
}): Promise<RelayUploadResult> {
  const { baseUrl, file, messages, signal, onProgress } = params;

  const session = readSessionResponse(
    await postJson<unknown>({
      url: `${baseUrl}/sessions`,
      body: {
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
      },
      fileName: file.name,
      messages,
      signal,
    }),
    messages,
  );

  const chunks: UploadChunkDescriptor[] = [];
  for (let index = 0; index < session.totalChunks; index += 1) {
    chunks.push(
      await uploadChunk({
        baseUrl,
        file,
        session,
        index,
        messages,
        signal,
        onProgress,
      }),
    );
  }

  const manifest = await postJson<UploadManifest>({
    url: `${baseUrl}/sessions/complete`,
    body: { session: session.session, chunks },
    fileName: file.name,
    messages,
    signal,
  });

  const parsed = parseStoredUploadManifest(JSON.stringify(manifest));
  if (!parsed) {
    throw new UploadRequestError(messages.invalidResponse, {
      code: "UPLOAD_INVALID_RESPONSE",
      retryable: true,
    });
  }

  onProgress?.(100);

  return {
    s3Key: parsed.chunks[0].url,
    fileName: parsed.fileName,
    mimeType: parsed.mimeType,
    sizeBytes: parsed.sizeBytes,
    storage: parsed.storage,
    previewUrl: null,
    chunked: true,
    chunkManifest: parsed,
  };
}

export async function uploadFileViaRelay(params: {
  roomCode: string;
  file: File;
  messages: UploadClientMessages;
  signal?: AbortSignal;
  onProgress?: (percent: number) => void;
}): Promise<RelayUploadResult> {
  const { roomCode, file, messages, signal, onProgress } = params;
  const baseUrl = `/api/rooms/${encodeURIComponent(roomCode)}/upload`;

  if (file.size <= UPLOAD_SINGLE_REQUEST_MAX_BYTES) {
    return uploadSingle({
      url: `${baseUrl}/forward`,
      roomCode,
      file,
      messages,
      signal,
      onProgress,
    });
  }

  return uploadChunked({ baseUrl, file, messages, signal, onProgress });
}
