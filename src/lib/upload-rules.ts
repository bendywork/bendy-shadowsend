export const SANG_MEITU_MAX_BYTES = 20 * 1024 * 1024;
export const SANG_ICVE_MAX_BYTES = 100 * 1024 * 1024;

/**
 * Vercel Functions 的请求体上限为 4.5MB（非流式）。这里留出 multipart
 * 边界与头部开销，单次经服务端中转的文件上限取 4MB。
 */
export const SANG_SINGLE_REQUEST_MAX_BYTES = 4 * 1024 * 1024;

export const SANG_RETRYABLE_STATUS_CODES = [
  408, 409, 429, 500, 502, 503, 504, 520, 522, 524,
] as const;

const SANG_MEITU_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp"]);
const SANG_ICVE_BLOCKED_EXTENSIONS = new Set(["html", "htm"]);
const SANG_ALLOWED_HOST_SUFFIXES = [
  "sang.pub",
  "meitudata.com",
  "icve.com.cn",
] as const;
const IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "bmp",
  "svg",
  "avif",
  "heic",
  "heif",
  "tif",
  "tiff",
  "ico",
]);

const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  avif: "image/avif",
  heic: "image/heic",
  heif: "image/heif",
  tif: "image/tiff",
  tiff: "image/tiff",
  ico: "image/x-icon",
};

export type SangChannel = "meitu" | "icve";

export type SangChannelInput = {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

export function getFileExtension(fileName: string): string {
  const baseName = fileName.split(/[\\/]/).pop() ?? "";
  const dotIndex = baseName.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === baseName.length - 1) return "";
  return baseName.slice(dotIndex + 1).toLowerCase();
}

export function isImageFile(fileName: string, mimeType: string): boolean {
  if (mimeType.trim().toLowerCase().startsWith("image/")) return true;
  return IMAGE_EXTENSIONS.has(getFileExtension(fileName));
}

export function resolveImageMimeType(
  fileName: string,
  mimeType: string,
): string {
  const normalized = mimeType.trim().toLowerCase();
  if (normalized.startsWith("image/")) return mimeType;
  return (
    IMAGE_MIME_BY_EXTENSION[getFileExtension(fileName)] ??
    "application/octet-stream"
  );
}

/**
 * file.sang.pub 通道选择：
 * - meitu：jpg/jpeg/png/gif/webp，且 ≤20MB；
 * - icve：除 html/htm 外的文件，且 ≤100MB；
 * - 超出范围返回 null，由调用方给出明确错误。
 */
export function selectSangChannel(
  input: SangChannelInput,
): SangChannel | null {
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    return null;
  }

  const extension = getFileExtension(input.fileName);

  if (
    isImageFile(input.fileName, input.mimeType) &&
    SANG_MEITU_EXTENSIONS.has(extension) &&
    input.sizeBytes <= SANG_MEITU_MAX_BYTES
  ) {
    return "meitu";
  }

  if (
    !SANG_ICVE_BLOCKED_EXTENSIONS.has(extension) &&
    input.sizeBytes <= SANG_ICVE_MAX_BYTES
  ) {
    return "icve";
  }

  return null;
}

export function isRetryableSangStatus(status: number): boolean {
  return (SANG_RETRYABLE_STATUS_CODES as readonly number[]).includes(status);
}

export function isAllowedSangHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  return SANG_ALLOWED_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}

/**
 * 仅接受 file.sang.pub 已知通道返回的 http(s) URL。
 * 防止客户端伪造 SANG 附件时把下载/预览重定向到任意站点。
 */
export function isAllowedSangUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    return isAllowedSangHost(url.hostname);
  } catch {
    return false;
  }
}
