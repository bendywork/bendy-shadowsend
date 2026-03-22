import { ApiError } from "@/lib/api";
import { env } from "@/lib/env";

function trimSlash(url: string) {
  return url.replace(/\/+$/, "");
}

function encodePath(path: string) {
  return path
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export function isDufsConfigured() {
  return Boolean(env.dufs.baseUrl);
}

export function createDufsPublicUrl(path: string) {
  const base = env.dufs.publicBaseUrl || env.dufs.baseUrl;
  if (!base) {
    throw new ApiError(500, "DUFS 未配置", "DUFS_NOT_CONFIGURED");
  }
  return `${trimSlash(base)}/${encodePath(path)}`;
}

export async function uploadImageToDufs(params: {
  path: string;
  body: Uint8Array;
  contentType: string;
}) {
  const base = env.dufs.baseUrl;
  if (!base) {
    throw new ApiError(500, "DUFS 未配置", "DUFS_NOT_CONFIGURED");
  }

  const uploadUrl = `${trimSlash(base)}/${encodePath(params.path)}`;
  const headers: HeadersInit = {
    "Content-Type": params.contentType,
  };

  if (env.dufs.auth) {
    headers.Authorization = env.dufs.auth;
  }

  let response: Response;
  try {
    response = await fetch(uploadUrl, {
      method: "PUT",
      headers,
      body: Buffer.from(params.body),
      cache: "no-store",
    });
  } catch (error) {
    console.error("[dufs] upload request failed", {
      uploadUrl,
      contentType: params.contentType,
      sizeBytes: params.body.byteLength,
      error,
    });
    throw new ApiError(502, "DUFS 上传请求失败", "DUFS_UPLOAD_REQUEST_FAILED");
  }

  if (!response.ok) {
    const rawText = await response.text().catch(() => "");
    console.error("[dufs] upload http error", {
      uploadUrl,
      status: response.status,
      statusText: response.statusText,
      rawText,
    });
    throw new ApiError(
      502,
      `DUFS 上传失败 (${response.status})`,
      "DUFS_UPLOAD_FAILED",
    );
  }

  return {
    path: params.path,
    publicUrl: createDufsPublicUrl(params.path),
  };
}
