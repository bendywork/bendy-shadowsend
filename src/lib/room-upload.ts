import { apiFetch } from "@/lib/client";
import {
  CHUNKED_UPLOAD_THRESHOLD_BYTES,
  DUFS_CHUNK_SIZE_BYTES,
  MAX_PROXY_UPLOAD_BYTES,
} from "@/lib/constants";
import type { MessageKey } from "@/lib/i18n/messages";
import type { AttachmentItem } from "@/types/chat";

export type ProxyUploadResult = {
  s3Key: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storage: AttachmentItem["storage"];
  previewUrl?: string | null;
};

type DirectUploadPreparePayload = {
  uploadUrl: string;
  previewUrl?: string | null;
  s3Key: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storage: AttachmentItem["storage"];
  method: "PUT";
  headers?: Record<string, string>;
};

export type UploadTranslate = (
  key: MessageKey,
  params?: Record<string, string | number>,
) => string;

export type UploadProgress = (percent: number) => void;

async function uploadByProxy(
  roomCode: string,
  file: File,
  t: UploadTranslate,
  onProgress?: UploadProgress,
) {
  const formData = new FormData();
  formData.append("file", file, file.name);

  const requestUrl = `/api/rooms/${roomCode}/upload`;
  return new Promise<ProxyUploadResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", requestUrl, true);
    xhr.withCredentials = true;

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || !onProgress) return;
      const percent = Math.min(
        100,
        Math.round((event.loaded / event.total) * 100),
      );
      onProgress(percent);
    };

    xhr.onerror = () => {
      console.error("[upload] xhr network error", {
        requestUrl,
        roomCode,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
      });
      reject(new Error(t("toast.networkError")));
    };

    xhr.onload = () => {
      if (xhr.status === 413) {
        console.error("[upload] proxy payload too large", {
          requestUrl,
          roomCode,
          status: xhr.status,
          responseText: xhr.responseText,
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
        });
        reject(
          new Error(
            t("toast.uploadTooLarge", {
              max: Math.floor(MAX_PROXY_UPLOAD_BYTES / 1024 / 1024),
            }),
          ),
        );
        return;
      }

      let parsed:
        | {
            ok: boolean;
            data?: ProxyUploadResult;
            error?: { message?: string; code?: string };
          }
        | null = null;

      try {
        parsed = xhr.responseText
          ? (JSON.parse(xhr.responseText) as {
              ok: boolean;
              data?: ProxyUploadResult;
              error?: { message?: string; code?: string };
            })
          : null;
      } catch (parseError) {
        console.error("[upload] xhr parse error", {
          requestUrl,
          roomCode,
          status: xhr.status,
          responseText: xhr.responseText,
          error: parseError,
        });
        reject(new Error(t("toast.uploadFailed", { name: file.name })));
        return;
      }

      if (xhr.status >= 200 && xhr.status < 300 && parsed?.ok && parsed.data) {
        if (onProgress) onProgress(100);
        resolve(parsed.data);
        return;
      }

      console.error("[upload] xhr response error", {
        requestUrl,
        roomCode,
        status: xhr.status,
        responseText: xhr.responseText,
        payload: parsed,
      });

      reject(
        new Error(
          parsed?.error?.message ?? t("toast.uploadFailed", { name: file.name }),
        ),
      );
    };

    xhr.send(formData);
  });
}

async function uploadByChunkedProxy(
  roomCode: string,
  file: File,
  t: UploadTranslate,
  onProgress?: UploadProgress,
) {
  const totalChunks = Math.ceil(file.size / DUFS_CHUNK_SIZE_BYTES);
  let dufsPath: string | null = null;

  const cleanupDufsFile = async () => {
    if (!dufsPath) return;
    await fetch(`/api/rooms/${roomCode}/upload/chunk`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dufsPath }),
    }).catch(() => {});
  };

  for (let i = 0; i < totalChunks; i++) {
    const start = i * DUFS_CHUNK_SIZE_BYTES;
    const end = Math.min(start + DUFS_CHUNK_SIZE_BYTES, file.size);
    const chunk = file.slice(start, end);

    const formData = new FormData();
    formData.append("file", chunk, file.name);
    formData.append("chunkIndex", String(i));
    formData.append("totalChunks", String(totalChunks));
    formData.append("totalBytes", String(file.size));
    formData.append("fileName", file.name);
    formData.append("mimeType", file.type);
    if (dufsPath) {
      formData.append("dufsPath", dufsPath);
    }

    const requestUrl = `/api/rooms/${roomCode}/upload/chunk`;

    let response: Response;
    try {
      response = await fetch(requestUrl, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
    } catch {
      await cleanupDufsFile();
      throw new Error(t("toast.networkError"));
    }

    let parsed: {
      ok: boolean;
      data?: ProxyUploadResult & { dufsPath: string };
      error?: { message?: string };
    } | null = null;

    try {
      parsed = await response.json();
    } catch {
      await cleanupDufsFile();
      throw new Error(t("toast.uploadFailed", { name: file.name }));
    }

    if (!response.ok || !parsed?.ok || !parsed?.data) {
      await cleanupDufsFile();
      throw new Error(
        parsed?.error?.message ?? t("toast.uploadFailed", { name: file.name }),
      );
    }

    if (i === 0) {
      dufsPath = parsed.data.dufsPath;
    }

    if (onProgress) {
      onProgress(Math.min(100, Math.round(((i + 1) / totalChunks) * 100)));
    }

    if (parsed.data.s3Key) {
      return {
        s3Key: parsed.data.s3Key,
        fileName: parsed.data.fileName,
        mimeType: parsed.data.mimeType,
        sizeBytes: parsed.data.sizeBytes,
        storage: parsed.data.storage,
        previewUrl: parsed.data.previewUrl ?? null,
      } satisfies ProxyUploadResult;
    }
  }

  throw new Error(t("toast.uploadFailed", { name: file.name }));
}

async function uploadDirectToS3(
  roomCode: string,
  file: File,
  t: UploadTranslate,
  onProgress?: UploadProgress,
) {
  const mimeType = file.type?.trim() || "application/octet-stream";
  const prepare = await apiFetch<DirectUploadPreparePayload>(
    `/api/rooms/${roomCode}/upload-url`,
    {
      method: "POST",
      body: JSON.stringify({
        fileName: file.name,
        mimeType,
        sizeBytes: file.size,
      }),
    },
  );

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(prepare.method ?? "PUT", prepare.uploadUrl, true);

    Object.entries(prepare.headers ?? {}).forEach(([key, value]) => {
      xhr.setRequestHeader(key, value);
    });

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || !onProgress) return;
      const percent = Math.min(
        100,
        Math.round((event.loaded / event.total) * 100),
      );
      onProgress(percent);
    };

    xhr.onerror = () => {
      console.error("[upload-direct] xhr network error", {
        roomCode,
        uploadUrl: prepare.uploadUrl,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
      });
      reject(new Error(t("toast.networkError")));
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        if (onProgress) onProgress(100);
        resolve();
        return;
      }

      console.error("[upload-direct] xhr response error", {
        roomCode,
        uploadUrl: prepare.uploadUrl,
        status: xhr.status,
        responseText: xhr.responseText,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
      });
      reject(new Error(t("toast.uploadFailed", { name: file.name })));
    };

    xhr.send(file);
  });

  return {
    s3Key: prepare.s3Key,
    fileName: prepare.fileName,
    mimeType: prepare.mimeType,
    sizeBytes: prepare.sizeBytes,
    storage: prepare.storage ?? "S3",
    previewUrl: prepare.previewUrl ?? null,
  } satisfies ProxyUploadResult;
}

export type FallbackUploadStrategy = "too-large" | "chunked-proxy" | "proxy";

export function resolveFallbackUploadStrategy(file: {
  size: number;
  type: string;
}): FallbackUploadStrategy {
  if (file.size > MAX_PROXY_UPLOAD_BYTES) {
    return "too-large";
  }
  if (file.type.startsWith("image/") && file.size >= CHUNKED_UPLOAD_THRESHOLD_BYTES) {
    return "chunked-proxy";
  }
  return "proxy";
}

export async function uploadRoomFile({
  roomCode,
  file,
  t,
  onProgress,
}: {
  roomCode: string;
  file: File;
  t: UploadTranslate;
  onProgress?: UploadProgress;
}) {
  try {
    return await uploadDirectToS3(roomCode, file, t, onProgress);
  } catch (directUploadError) {
    console.error("[upload] direct upload failed, falling back to proxy", {
      roomCode,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      error: directUploadError,
    });

    const strategy = resolveFallbackUploadStrategy(file);
    if (strategy === "too-large") {
      throw new Error(
        t("toast.uploadTooLarge", {
          max: Math.floor(MAX_PROXY_UPLOAD_BYTES / 1024 / 1024),
        }),
      );
    }

    if (strategy === "chunked-proxy") {
      return uploadByChunkedProxy(roomCode, file, t, onProgress);
    }

    return uploadByProxy(roomCode, file, t, onProgress);
  }
}
