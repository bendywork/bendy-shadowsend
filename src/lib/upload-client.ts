import { ApiRequestError } from "@/lib/client";
import {
  type ChunkManifest,
  type RemoteAttachment,
  isRemoteFileUrl,
  remoteAttachmentSchema,
  SINGLE_UPLOAD_BYTES,
  UPLOAD_CHUNK_BYTES,
  UPLOAD_URL,
} from "@/lib/attachment-storage";
import { MAX_ATTACHMENT_SIZE_BYTES } from "@/lib/constants";

export class UploadError extends ApiRequestError {
  constructor(code: string, readonly retryable: boolean, status?: number) {
    super("文件上传失败，请重试", { code, status });
    this.name = "UploadError";
  }
}

type UploadOptions = { onProgress?: (percent: number) => void; signal?: AbortSignal };
export type UploadedFile = RemoteAttachment & { previewUrl: string | null };

// Keep completed files/chunks while a pending message is retried. WeakMaps release their
// data when the composer/pending message no longer owns the immutable File objects.
const uploadedFiles = new WeakMap<File, UploadedFile>();
const uploadedChunks = new WeakMap<File, ChunkManifest["chunks"]>();
let activeRequests = 0;
const waitingRequests: Array<() => void> = [];

async function withUploadSlot<T>(run: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  if (activeRequests >= 3) {
    await new Promise<void>((resolve, reject) => {
      const start = () => { signal?.removeEventListener("abort", cancel); resolve(); };
      const cancel = () => {
        const index = waitingRequests.indexOf(start);
        if (index >= 0) waitingRequests.splice(index, 1);
        reject(new UploadError("UPLOAD_ABORTED", false));
      };
      waitingRequests.push(start);
      signal?.addEventListener("abort", cancel, { once: true });
      if (signal?.aborted) cancel();
    });
  } else {
    activeRequests += 1;
  }
  try {
    if (signal?.aborted) throw new UploadError("UPLOAD_ABORTED", false);
    return await run();
  } finally {
    const next = waitingRequests.shift();
    if (next) next();
    else activeRequests -= 1;
  }
}

function uploadPart(blob: Blob, name: string, options: UploadOptions): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const finish = (error?: UploadError, url?: string) => {
      options.signal?.removeEventListener("abort", abort);
      if (error) reject(error);
      else resolve(url!);
    };
    xhr.open("POST", UPLOAD_URL, true);
    xhr.withCredentials = false;
    xhr.timeout = 90_000;
    xhr.responseType = "text";
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        options.onProgress?.(Math.min(99, Math.round(event.loaded / event.total * 100)));
      }
    };
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        finish(new UploadError("UPLOAD_HTTP_ERROR", xhr.status === 408 || xhr.status === 429 || xhr.status >= 500, xhr.status));
        return;
      }
      const url = xhr.responseText.trim();
      if (!isRemoteFileUrl(url)) {
        finish(new UploadError("UPLOAD_INVALID_RESPONSE", false));
        return;
      }
      finish(undefined, url);
    };
    xhr.onerror = () => finish(new UploadError("NETWORK_ERROR", true));
    xhr.ontimeout = () => finish(new UploadError("UPLOAD_TIMEOUT", true));
    xhr.onabort = () => finish(new UploadError("UPLOAD_ABORTED", false));
    const form = new FormData();
    form.append("file", blob, name);
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) {
      finish(new UploadError("UPLOAD_ABORTED", false));
      return;
    }
    // The browser generates multipart boundaries; application cookies/headers stay local.
    xhr.send(form);
  });
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const cancel = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      reject(new UploadError("UPLOAD_ABORTED", false));
    };
    const timer = setTimeout(() => { signal?.removeEventListener("abort", cancel); resolve(); }, ms);
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) cancel();
  });
}

async function uploadPartWithRetry(blob: Blob, name: string, options: UploadOptions) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await uploadPart(blob, name, options);
    } catch (error) {
      if (!(error instanceof UploadError) || !error.retryable || attempt >= 3) throw error;
      await delay(400 * 2 ** (attempt - 1), options.signal);
    }
  }
}

async function sha256(blob: Blob) {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** All chat files and announcement images use the same unauthenticated multipart API. */
async function performUpload(file: File, options: UploadOptions): Promise<UploadedFile> {
  if (options.signal?.aborted) throw new UploadError("UPLOAD_ABORTED", false);
  if (file.size <= 0 || file.size > MAX_ATTACHMENT_SIZE_BYTES) throw new UploadError("UPLOAD_SIZE_INVALID", false);
  const fileName = file.name.trim();
  const mimeType = file.type || "application/octet-stream";
  if (!fileName || fileName.length > 255 || /[\r\n\0/\\]/.test(fileName)) throw new UploadError("UPLOAD_NAME_INVALID", false);
  const cached = uploadedFiles.get(file);
  if (cached) { options.onProgress?.(100); return cached; }
  options.onProgress?.(0);

  let s3Key: string;
  let chunkManifest: ChunkManifest | null = null;
  if (file.size <= SINGLE_UPLOAD_BYTES) {
    s3Key = await uploadPartWithRetry(file, fileName, options);
  } else {
    const chunks = uploadedChunks.get(file) ?? [];
    uploadedChunks.set(file, chunks);
    const totalChunks = Math.ceil(file.size / UPLOAD_CHUNK_BYTES);
    for (let index = chunks.length; index < totalChunks; index += 1) {
      if (options.signal?.aborted) throw new UploadError("UPLOAD_ABORTED", false);
      const start = index * UPLOAD_CHUNK_BYTES;
      const blob = file.slice(start, Math.min(start + UPLOAD_CHUNK_BYTES, file.size), mimeType);
      const hash = await sha256(blob);
      // Prefix the chunk index, preserving the original extension used by the upload service.
      const url = await uploadPartWithRetry(blob, `${index}-${fileName}`, {
        signal: options.signal,
        onProgress: (percent) => options.onProgress?.(Math.min(99,
          Math.round((start + blob.size * percent / 100) / file.size * 100))),
      });
      chunks.push({ index, url, sizeBytes: blob.size, sha256: hash });
    }
    chunkManifest = { version: 1, chunkSize: UPLOAD_CHUNK_BYTES, sizeBytes: file.size, chunks: [...chunks] };
    s3Key = chunks[0].url;
  }

  const attachment = remoteAttachmentSchema.parse({ fileName, mimeType, sizeBytes: file.size, s3Key, storage: "REMOTE", chunkManifest });
  const result: UploadedFile = {
    ...attachment,
    previewUrl: !chunkManifest && /^(image|video)\//.test(mimeType) ? s3Key : null,
  };
  uploadedFiles.set(file, result);
  uploadedChunks.delete(file);
  options.onProgress?.(100);
  return result;
}

export function uploadFile(file: File, options: UploadOptions = {}): Promise<UploadedFile> {
  return withUploadSlot(() => performUpload(file, options), options.signal);
}
