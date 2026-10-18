import type { MessageKey } from "@/lib/i18n/messages";

/**
 * 上传前置校验（REQ-202610-0515 / up-06）。
 *
 * 浏览器与服务端共用同一套规则，避免前端只按旧 S3/DUFS 规则校验、
 * 直到服务端才因新服务限额或白名单失败：
 * - 图片走 file.sang.pub（meitu ≤20MB / icve ≤100MB，拒绝 html/htm）；
 * - 非图片走 pic.sl.al（≤200MB，仅允许 58 项扩展名白名单）；
 * - 单次经 Vercel 的请求体 ≤4.5MB，实际分片按 4MB/片规划，最多 50 片。
 */

/** Vercel Functions 非流式请求体上限（4.5MB）。 */
export const VERCEL_FUNCTION_BODY_LIMIT_BYTES = Math.floor(4.5 * 1024 * 1024);

/** 分片大小：4MB，为 multipart 边界与协议头留出余量。 */
export const UPLOAD_CHUNK_SIZE_BYTES = 4 * 1024 * 1024;

/** 单请求可承载的文件上限。 */
export const UPLOAD_SINGLE_REQUEST_MAX_BYTES = UPLOAD_CHUNK_SIZE_BYTES;

export const SANG_MAX_BYTES = 100 * 1024 * 1024;
export const SANG_MEITU_MAX_BYTES = 20 * 1024 * 1024;
export const PIC_SL_MAX_BYTES = 200 * 1024 * 1024;

/** 200MB / 4MB = 50 片。 */
export const UPLOAD_MAX_CHUNKS = Math.ceil(
  PIC_SL_MAX_BYTES / UPLOAD_CHUNK_SIZE_BYTES,
);

export const SANG_MEITU_EXTENSIONS = [
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
] as const;

/** file.sang.pub 的 icve 通道拒绝 HTML，避免托管活动页面。 */
const SANG_BLOCKED_EXTENSIONS = new Set(["html", "htm"]);

const sangMeituExtensionSet = new Set<string>(SANG_MEITU_EXTENSIONS);

/** pic.sl.al 首页文件选择器的 accept 白名单（58 项）。 */
export const PIC_SL_ALLOWED_EXTENSIONS = [
  ".txt",
  ".md",
  ".csv",
  ".json",
  ".xml",
  ".pdf",
  ".rtf",
  ".epub",
  ".zip",
  ".7z",
  ".rar",
  ".gz",
  ".tar",
  ".tgz",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".odt",
  ".ods",
  ".odp",
  ".mp3",
  ".m4a",
  ".wav",
  ".ogg",
  ".flac",
  ".aac",
  ".mp4",
  ".m4v",
  ".webm",
  ".mov",
  ".avi",
  ".mkv",
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".avif",
  ".apng",
  ".bmp",
  ".tif",
  ".tiff",
  ".ico",
  ".heic",
  ".heif",
  ".svg",
  ".jxl",
  ".jp2",
  ".jpx",
  ".psd",
  ".ai",
  ".sketch",
  ".fig",
  ".dwg",
  ".dxf",
] as const;

const picSlAllowedExtensionSet = new Set<string>(
  PIC_SL_ALLOWED_EXTENSIONS.map((extension) => extension.slice(1)),
);

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

export type UploadServiceId = "sang" | "pic-sl";
export type SangChannel = "meitu" | "icve";

export type UploadPreflightErrorCode =
  | "UPLOAD_FILE_EMPTY"
  | "UPLOAD_SIZE_INVALID"
  | "UPLOAD_TYPE_UNSUPPORTED"
  | "UPLOAD_SERVICE_LIMIT_EXCEEDED"
  | "UPLOAD_CHUNK_COUNT_EXCEEDED";

export type UploadPreflightParams = {
  fileName?: string;
  ext?: string;
  service?: UploadServiceId;
  max?: number;
  count?: number;
};

export type UploadPreflightError = {
  code: UploadPreflightErrorCode;
  messageKey: MessageKey;
  params: UploadPreflightParams;
};

export type UploadChunkPlan = {
  totalBytes: number;
  chunkSize: number;
  totalChunks: number;
  lastChunkBytes: number;
  requiresChunking: boolean;
};

export type UploadPreflightSuccess = {
  ok: true;
  service: UploadServiceId;
  channel: SangChannel | null;
  limitBytes: number;
  chunkPlan: UploadChunkPlan;
};

export type UploadPreflightResult =
  | UploadPreflightSuccess
  | { ok: false; error: UploadPreflightError };

export type UploadFileInput = {
  fileName: string;
  mimeType?: string | null;
  sizeBytes: number;
};

/** 取小写扩展名（不含点）；隐藏文件与无扩展名返回空串。 */
export function getFileExtension(fileName: string): string {
  const baseName = fileName.split(/[\\/]/).pop() ?? "";
  const dotIndex = baseName.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === baseName.length - 1) {
    return "";
  }
  return baseName.slice(dotIndex + 1).toLowerCase();
}

export function isImageFile(fileName: string, mimeType: string): boolean {
  if (mimeType.trim().toLowerCase().startsWith("image/")) {
    return true;
  }
  return IMAGE_EXTENSIONS.has(getFileExtension(fileName));
}

/** 图片 → sang，其余 → pic-sl。 */
export function resolveUploadService(
  fileName: string,
  mimeType: string,
): UploadServiceId {
  return isImageFile(fileName, mimeType) ? "sang" : "pic-sl";
}

/** meitu 仅接受 5 种图片且 ≤20MB；其余非 HTML 文件走 icve。 */
export function resolveSangChannel(
  fileName: string,
  sizeBytes: number,
): SangChannel | null {
  if (
    !Number.isSafeInteger(sizeBytes) ||
    sizeBytes <= 0 ||
    sizeBytes > SANG_MAX_BYTES
  ) {
    return null;
  }

  const extension = getFileExtension(fileName);
  if (SANG_BLOCKED_EXTENSIONS.has(extension)) {
    return null;
  }

  const isMeituImage =
    sangMeituExtensionSet.has(extension) && isImageFile(fileName, "");
  if (isMeituImage && sizeBytes <= SANG_MEITU_MAX_BYTES) {
    return "meitu";
  }

  return "icve";
}

/**
 * 预计算分片方案。分片数为 1 时表示可单请求上传。
 * 非法输入属于调用方错误，直接抛 RangeError。
 */
export function createUploadChunkPlan(
  sizeBytes: number,
  chunkSize: number = UPLOAD_CHUNK_SIZE_BYTES,
): UploadChunkPlan {
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) {
    throw new RangeError("UPLOAD_SIZE_INVALID");
  }
  if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0) {
    throw new RangeError("UPLOAD_CHUNK_SIZE_INVALID");
  }

  const totalChunks = Math.ceil(sizeBytes / chunkSize);
  return {
    totalBytes: sizeBytes,
    chunkSize,
    totalChunks,
    lastChunkBytes: sizeBytes - (totalChunks - 1) * chunkSize,
    requiresChunking: totalChunks > 1,
  };
}

/** 返回指定分片的期望字节数；索引非法时返回 null。 */
export function getExpectedChunkBytes(
  plan: UploadChunkPlan,
  chunkIndex: number,
): number | null {
  if (
    !Number.isInteger(chunkIndex) ||
    chunkIndex < 0 ||
    chunkIndex >= plan.totalChunks
  ) {
    return null;
  }
  return chunkIndex === plan.totalChunks - 1
    ? plan.lastChunkBytes
    : plan.chunkSize;
}

export function isUploadChunkSizeValid(
  plan: UploadChunkPlan,
  chunkIndex: number,
  actualBytes: number,
): boolean {
  return getExpectedChunkBytes(plan, chunkIndex) === actualBytes;
}

function preflightFailure(
  code: UploadPreflightErrorCode,
  messageKey: MessageKey,
  params: UploadPreflightParams,
): UploadPreflightResult {
  return { ok: false, error: { code, messageKey, params } };
}

function isServiceExtensionAllowed(
  service: UploadServiceId,
  extension: string,
): boolean {
  if (service === "sang") {
    return !SANG_BLOCKED_EXTENSIONS.has(extension);
  }
  return picSlAllowedExtensionSet.has(extension);
}

/** 上传前统一校验：空文件、类型/扩展名、服务限额与分片数量。 */
export function validateUploadFile(
  input: UploadFileInput,
): UploadPreflightResult {
  const fileName = input.fileName.trim();
  const mimeType = input.mimeType?.trim() || "application/octet-stream";
  const { sizeBytes } = input;

  if (sizeBytes === 0) {
    return preflightFailure("UPLOAD_FILE_EMPTY", "toast.uploadEmptyFile", {
      fileName,
    });
  }

  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0) {
    return preflightFailure("UPLOAD_SIZE_INVALID", "toast.uploadSizeInvalid", {
      fileName,
    });
  }

  const service = resolveUploadService(fileName, mimeType);
  const extension = getFileExtension(fileName);

  if (!isServiceExtensionAllowed(service, extension)) {
    return preflightFailure(
      "UPLOAD_TYPE_UNSUPPORTED",
      "toast.uploadUnsupportedType",
      { fileName, ext: extension },
    );
  }

  const limitBytes = service === "sang" ? SANG_MAX_BYTES : PIC_SL_MAX_BYTES;
  if (sizeBytes > limitBytes) {
    return preflightFailure(
      "UPLOAD_SERVICE_LIMIT_EXCEEDED",
      "toast.uploadTooLargeForService",
      {
        fileName,
        service,
        max: Math.floor(limitBytes / 1024 / 1024),
      },
    );
  }

  const chunkPlan = createUploadChunkPlan(sizeBytes);
  if (chunkPlan.totalChunks > UPLOAD_MAX_CHUNKS) {
    return preflightFailure(
      "UPLOAD_CHUNK_COUNT_EXCEEDED",
      "toast.uploadChunkCountExceeded",
      {
        fileName,
        count: chunkPlan.totalChunks,
        max: UPLOAD_MAX_CHUNKS,
      },
    );
  }

  const channel =
    service === "sang" ? resolveSangChannel(fileName, sizeBytes) : null;
  if (service === "sang" && !channel) {
    return preflightFailure(
      "UPLOAD_TYPE_UNSUPPORTED",
      "toast.uploadUnsupportedType",
      { fileName, ext: extension },
    );
  }

  return { ok: true, service, channel, limitBytes, chunkPlan };
}

const SERVICE_LABELS: Record<UploadServiceId, string> = {
  sang: "图片服务",
  "pic-sl": "文件服务",
};

/** 服务端错误响应使用的中文文案（与客户端 i18n 键一一对应）。 */
export function uploadPreflightErrorMessage(
  error: UploadPreflightError,
): string {
  switch (error.code) {
    case "UPLOAD_FILE_EMPTY":
      return "不能上传空文件";
    case "UPLOAD_SIZE_INVALID":
      return "文件大小无效，请重新选择";
    case "UPLOAD_TYPE_UNSUPPORTED":
      return error.params.ext
        ? `不支持该文件类型（.${error.params.ext}）`
        : "不支持该文件类型";
    case "UPLOAD_SERVICE_LIMIT_EXCEEDED": {
      const service = error.params.service ?? "pic-sl";
      return `文件超过${SERVICE_LABELS[service]}的 ${error.params.max ?? 0}MB 上限`;
    }
    case "UPLOAD_CHUNK_COUNT_EXCEEDED":
      return `文件需要 ${error.params.count ?? 0} 个分片，超过 ${error.params.max ?? 0} 片上限`;
  }
}

export function uploadPreflightHttpStatus(
  error: UploadPreflightError,
): number {
  if (error.code === "UPLOAD_TYPE_UNSUPPORTED") {
    return 415;
  }
  if (
    error.code === "UPLOAD_SERVICE_LIMIT_EXCEEDED" ||
    error.code === "UPLOAD_CHUNK_COUNT_EXCEEDED"
  ) {
    return 413;
  }
  return 400;
}
