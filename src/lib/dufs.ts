import { ApiError } from "@/lib/api";
import { env } from "@/lib/env";

function trimSlash(url: string) {
  return url.replace(/\/+$/, "");
}

function normalizePrefix(prefix?: string) {
  const value = (prefix ?? "").trim();
  if (!value) return "";
  const withoutOuter = value.replace(/^\/+|\/+$/g, "");
  return withoutOuter ? `/${withoutOuter}` : "";
}

function normalizeAuthHeader(value?: string) {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith("basic ") ||
    lower.startsWith("bearer ") ||
    lower.startsWith("digest ")
  ) {
    return trimmed;
  }

  if (trimmed.includes(":")) {
    const encoded = Buffer.from(trimmed).toString("base64");
    return `Basic ${encoded}`;
  }

  return trimmed;
}

function parseBaseAuth(baseUrl?: string) {
  if (!baseUrl) return undefined;
  try {
    const parsed = new URL(baseUrl);
    if (!parsed.username) return undefined;
    const username = decodeURIComponent(parsed.username);
    const password = decodeURIComponent(parsed.password ?? "");
    return normalizeAuthHeader(`${username}:${password}`);
  } catch {
    return undefined;
  }
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
  const prefix = normalizePrefix(env.dufs.pathPrefix);
  return `${trimSlash(base)}${prefix}/${encodePath(path)}`;
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

  const prefix = normalizePrefix(env.dufs.pathPrefix);
  const uploadUrl = `${trimSlash(base)}${prefix}/${encodePath(params.path)}`;
  const headers: HeadersInit = {
    "Content-Type": params.contentType,
  };

  const authHeader =
    normalizeAuthHeader(env.dufs.auth) || parseBaseAuth(env.dufs.baseUrl);
  if (authHeader) {
    headers.Authorization = authHeader;
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
      hint:
        response.status === 403
          ? "Check dufs permissions: enable --allow-upload, ensure auth account has :rw on target path, and verify DUFS_PATH_PREFIX."
          : undefined,
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
