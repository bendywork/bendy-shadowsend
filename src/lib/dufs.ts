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

  // Strip Dufs-style path/permission suffix: user:pass@/path:rw → user:pass
  let creds = trimmed;
  const atPath = creds.lastIndexOf("@/");
  if (atPath > 0) {
    creds = creds.slice(0, atPath);
  }

  if (creds.includes(":")) {
    const encoded = Buffer.from(creds).toString("base64");
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

function getInternalBaseUrl() {
  const base = env.dufs.baseUrl;
  if (!base) {
    throw new ApiError(500, "DUFS not configured", "DUFS_NOT_CONFIGURED");
  }
  return `${trimSlash(base)}${normalizePrefix(env.dufs.pathPrefix)}`;
}

function getAuthHeader() {
  return normalizeAuthHeader(env.dufs.auth) || parseBaseAuth(env.dufs.baseUrl);
}

export function isDufsConfigured() {
  return Boolean(env.dufs.baseUrl);
}

export function createDufsPublicUrl(path: string) {
  const base = env.dufs.publicBaseUrl || env.dufs.baseUrl;
  if (!base) {
    throw new ApiError(500, "DUFS not configured", "DUFS_NOT_CONFIGURED");
  }
  return `${trimSlash(base)}${normalizePrefix(env.dufs.pathPrefix)}/${encodePath(path)}`;
}

export async function uploadImageToDufs(params: {
  path: string;
  body: Uint8Array;
  contentType: string;
}) {
  const uploadUrl = `${getInternalBaseUrl()}/${encodePath(params.path)}`;
  const headers: HeadersInit = {
    "Content-Type": params.contentType,
  };

  const authHeader = getAuthHeader();
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
    throw new ApiError(502, "DUFS upload request failed", "DUFS_UPLOAD_REQUEST_FAILED");
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
      `DUFS upload failed (${response.status})`,
      "DUFS_UPLOAD_FAILED",
    );
  }

  return {
    path: params.path,
    publicUrl: createDufsPublicUrl(params.path),
  };
}

export async function fetchDufsFile(path: string) {
  const fileUrl = `${getInternalBaseUrl()}/${encodePath(path)}`;
  const headers: HeadersInit = {};

  const authHeader = getAuthHeader();
  if (authHeader) {
    headers.Authorization = authHeader;
  }

  let response: Response;
  try {
    response = await fetch(fileUrl, {
      method: "GET",
      headers,
      cache: "no-store",
    });
  } catch (error) {
    console.error("[dufs] fetch request failed", {
      fileUrl,
      error,
    });
    throw new ApiError(502, "DUFS file request failed", "DUFS_FILE_REQUEST_FAILED");
  }

  if (!response.ok) {
    const rawText = await response.text().catch(() => "");
    console.error("[dufs] fetch http error", {
      fileUrl,
      status: response.status,
      statusText: response.statusText,
      rawText,
    });
    throw new ApiError(502, `DUFS file fetch failed (${response.status})`, "DUFS_FILE_FETCH_FAILED");
  }

  return response;
}

export async function appendToDufsFile(params: {
  path: string;
  body: Uint8Array;
}) {
  const fileUrl = `${getInternalBaseUrl()}/${encodePath(params.path)}`;
  const headers: HeadersInit = {
    "X-Update-Range": "append",
  };

  const authHeader = getAuthHeader();
  if (authHeader) {
    headers.Authorization = authHeader;
  }

  let response: Response;
  try {
    response = await fetch(fileUrl, {
      method: "PATCH",
      headers,
      body: Buffer.from(params.body),
      cache: "no-store",
    });
  } catch (error) {
    console.error("[dufs] append request failed", {
      fileUrl,
      sizeBytes: params.body.byteLength,
      error,
    });
    throw new ApiError(502, "DUFS append request failed", "DUFS_APPEND_REQUEST_FAILED");
  }

  if (!response.ok) {
    const rawText = await response.text().catch(() => "");
    console.error("[dufs] append http error", {
      fileUrl,
      status: response.status,
      statusText: response.statusText,
      rawText,
    });
    throw new ApiError(
      502,
      `DUFS append failed (${response.status})`,
      "DUFS_APPEND_FAILED",
    );
  }
}

export async function deleteDufsFile(path: string) {
  const fileUrl = `${getInternalBaseUrl()}/${encodePath(path)}`;
  const headers: HeadersInit = {};

  const authHeader = getAuthHeader();
  if (authHeader) {
    headers.Authorization = authHeader;
  }

  let response: Response;
  try {
    response = await fetch(fileUrl, {
      method: "DELETE",
      headers,
      cache: "no-store",
    });
  } catch (error) {
    console.error("[dufs] delete request failed", { fileUrl, error });
    throw new ApiError(502, "DUFS delete request failed", "DUFS_DELETE_REQUEST_FAILED");
  }

  if (!response.ok) {
    const rawText = await response.text().catch(() => "");
    console.error("[dufs] delete http error", {
      fileUrl,
      status: response.status,
      statusText: response.statusText,
      rawText,
    });
    throw new ApiError(
      502,
      `DUFS delete failed (${response.status})`,
      "DUFS_DELETE_FAILED",
    );
  }
}

export function createDufsImagePath(params: {
  roomId: string;
  suffix: string;
  fileName: string;
}) {
  return `img-${params.roomId}-${Date.now()}-${params.suffix}-${params.fileName}`;
}
