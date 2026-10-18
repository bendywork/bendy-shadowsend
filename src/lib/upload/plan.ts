import {
  PIC_SL_MAX_BYTES,
  SANG_MAX_BYTES,
  SANG_MEITU_MAX_BYTES,
  UPLOAD_CHUNK_SIZE_BYTES,
  UPLOAD_MAX_CHUNKS,
} from "@/lib/upload/constants";
import type {
  ChunkPlan,
  SangChannel,
  UploadServiceId,
} from "@/lib/upload/types";

export class UploadPlanError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "UploadPlanError";
    this.code = code;
  }
}

const MEITU_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);
const SANG_BLOCKED_EXTENSIONS = new Set([".html", ".htm"]);

const DANGEROUS_EXTENSIONS = new Set([
  ".exe",
  ".bat",
  ".cmd",
  ".com",
  ".msi",
  ".scr",
  ".pif",
  ".sh",
  ".bash",
  ".zsh",
  ".ps1",
  ".psm1",
  ".vbs",
  ".vbe",
  ".js",
  ".mjs",
  ".cjs",
  ".jsx",
  ".ts",
  ".tsx",
  ".php",
  ".phtml",
  ".jsp",
  ".jspx",
  ".asp",
  ".aspx",
  ".jar",
  ".war",
  ".class",
  ".dll",
  ".so",
  ".dylib",
  ".html",
  ".htm",
  ".svg",
]);

export function getFileExtension(fileName: string): string {
  const normalized = fileName.trim().toLowerCase();
  const lastDot = normalized.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === normalized.length - 1) {
    return "";
  }
  return normalized.slice(lastDot);
}

function hasExtensionSegment(fileName: string, extensions: Set<string>): boolean {
  const normalized = fileName.trim().toLowerCase();
  const segments = normalized.split(".").slice(1);
  return segments.some((segment) => extensions.has(`.${segment}`));
}

export function sanitizeUploadFileName(fileName: string): string {
  const cleaned = fileName
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim();

  const safeName = cleaned || "upload.bin";
  if (safeName.length <= 180) {
    return safeName;
  }

  const extension = getFileExtension(safeName);
  const stem = safeName.slice(0, Math.max(1, 180 - extension.length));
  return `${stem}${extension}`;
}

export function createChunkPlan(
  sizeBytes: number,
  chunkSize: number = UPLOAD_CHUNK_SIZE_BYTES,
): ChunkPlan {
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) {
    throw new UploadPlanError("UPLOAD_SIZE_INVALID", "文件大小无效");
  }

  if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0) {
    throw new UploadPlanError("UPLOAD_CHUNK_SIZE_INVALID", "分片大小无效");
  }

  const totalChunks = Math.ceil(sizeBytes / chunkSize);
  if (totalChunks > UPLOAD_MAX_CHUNKS) {
    throw new UploadPlanError("UPLOAD_TOO_MANY_CHUNKS", "文件分片数量超出限制");
  }

  return {
    chunkSize,
    totalChunks,
    lastChunkBytes: sizeBytes - (totalChunks - 1) * chunkSize,
  };
}

export function resolveUploadService(mimeType: string): UploadServiceId {
  return mimeType.trim().toLowerCase().startsWith("image/") ? "sang" : "pic-sl";
}

export function assertUploadFileNameAllowed(
  service: UploadServiceId,
  fileName: string,
): void {
  if (service === "sang") {
    if (hasExtensionSegment(fileName, SANG_BLOCKED_EXTENSIONS)) {
      throw new UploadPlanError(
        "UPLOAD_EXTENSION_BLOCKED",
        "该文件类型不能上传到图片服务",
      );
    }
    return;
  }

  if (hasExtensionSegment(fileName, DANGEROUS_EXTENSIONS)) {
    throw new UploadPlanError(
      "UPLOAD_EXTENSION_BLOCKED",
      "该文件类型不被文件服务允许",
    );
  }
}

export function assertUploadServiceLimit(
  service: UploadServiceId,
  sizeBytes: number,
): void {
  const limit = service === "sang" ? SANG_MAX_BYTES : PIC_SL_MAX_BYTES;
  if (sizeBytes > limit) {
    throw new UploadPlanError(
      "UPLOAD_FILE_TOO_LARGE",
      `文件超过服务上限（${Math.floor(limit / 1024 / 1024)}MB）`,
    );
  }
}

export function resolveSangChannel(params: {
  fileName: string;
  sizeBytes: number;
  chunked: boolean;
}): SangChannel {
  assertUploadFileNameAllowed("sang", params.fileName);

  if (params.chunked) {
    return "icve";
  }

  if (params.sizeBytes > SANG_MAX_BYTES) {
    throw new UploadPlanError(
      "UPLOAD_FILE_TOO_LARGE",
      `文件超过图片服务上限（${Math.floor(SANG_MAX_BYTES / 1024 / 1024)}MB）`,
    );
  }

  const extension = getFileExtension(params.fileName);
  if (MEITU_EXTENSIONS.has(extension) && params.sizeBytes <= SANG_MEITU_MAX_BYTES) {
    return "meitu";
  }

  return "icve";
}

export function buildChunkFileName(params: {
  fileName: string;
  index: number;
  totalChunks: number;
  service: UploadServiceId;
}): string {
  const safeName = sanitizeUploadFileName(params.fileName);
  const extension = getFileExtension(safeName);
  const stem = extension ? safeName.slice(0, -extension.length) : safeName;
  const width = Math.max(3, String(Math.max(0, params.totalChunks - 1)).length);
  const paddedIndex = String(params.index).padStart(width, "0");

  if (params.service === "sang") {
    // icve accepts arbitrary non-HTML files; dropping the original extension
    // keeps every chunk away from the HTML/HTM block list.
    return `${stem}.part${paddedIndex}`;
  }

  return `${stem}.part${paddedIndex}${extension || ".bin"}`;
}
