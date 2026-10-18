/**
 * pic.sl.al 上传规则（纯函数，可在浏览器与服务端共用）。
 *
 * 白名单来自 pic.sl.al 首页文件选择器的 accept 属性（2026-10-13 实测，共 58 项）。
 * 服务端必须再次校验，不能信任客户端提交的文件名或类型。
 */

export const PIC_SL_BASE_URL = "https://pic.sl.al";

/** pic.sl.al 单文件上限：200MB。 */
export const PIC_SL_MAX_FILE_BYTES = 200 * 1024 * 1024;

/**
 * Vercel Function 请求体上限为 4.5MB，这里留出安全余量，单请求按 4MB 控制。
 * 超过该值的文件需要走 up-04 的分片编排。
 */
export const PIC_SL_MAX_REQUEST_BYTES = 4 * 1024 * 1024;

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

const allowedExtensionSet = new Set<string>(PIC_SL_ALLOWED_EXTENSIONS);

const mimeTypePattern =
  /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i;

/** 取文件名的小写扩展名；无扩展名或隐藏文件返回空串。 */
export function getFileExtension(fileName: string): string {
  const baseName = fileName.split(/[\\/]/).pop() ?? "";
  const dotIndex = baseName.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === baseName.length - 1) {
    return "";
  }

  return baseName.slice(dotIndex).toLowerCase();
}

export function isPicSlSupportedFileName(fileName: string): boolean {
  return allowedExtensionSet.has(getFileExtension(fileName));
}

/**
 * 生成 ASCII 安全的远端文件名。
 *
 * pic.sl.al 的 X-Filename 头只接受 ASCII；实测直接传中文会变成乱码，
 * 因此远端使用清洗后的英文名，原始文件名仍保存在本地数据库与消息记录中。
 */
export function buildPicSlRemoteFileName(
  fileName: string,
  now: number = Date.now(),
  random: () => number = Math.random,
): string {
  const baseName = fileName.split(/[\\/]/).pop() ?? "upload";
  const extension = getFileExtension(baseName);
  const rawStem = extension ? baseName.slice(0, -extension.length) : baseName;
  const stem =
    rawStem
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/^[-._]+|[-._]+$/g, "")
      .slice(0, 80) || "upload";
  const randomPart = Math.floor(Math.abs(random()) * 0xffffffff)
    .toString(36)
    .slice(0, 8);
  const suffix = `${now.toString(36)}-${randomPart || "0"}`;

  return extension ? `${stem}-${suffix}${extension}` : `${stem}-${suffix}`;
}

/** 只接受 pic.sl.al 官方 https 直链，避免把任意 URL 写进附件记录。 */
export function normalizePicSlPublicUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    if (url.hostname !== "pic.sl.al") return null;
    if (!url.pathname.startsWith("/f/")) return null;
    if (url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** 规范化 MIME；非法值回退为 application/octet-stream。 */
export function normalizePicSlMimeType(value: string | null | undefined): string {
  const base = (value ?? "").split(";")[0].trim();
  return mimeTypePattern.test(base) ? base.toLowerCase() : "application/octet-stream";
}
