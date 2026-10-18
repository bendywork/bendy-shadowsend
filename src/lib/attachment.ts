import type { MessageKey } from "@/lib/i18n/messages";

/**
 * Attachment presentation helpers.
 *
 * The attachment card needs a stable, locale-independent notion of "what kind
 * of file is this" so the icon, type label and preview affordance stay in sync
 * across sent messages and the composer's optimistic pending messages.
 */
export type AttachmentKind =
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "word"
  | "spreadsheet"
  | "presentation"
  | "archive"
  | "code"
  | "text"
  | "other";

const EXTENSION_KINDS: Record<string, AttachmentKind> = {
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
  avif: "image",
  bmp: "image",
  svg: "image",
  heic: "image",
  heif: "image",
  mp4: "video",
  webm: "video",
  mov: "video",
  m4v: "video",
  mkv: "video",
  avi: "video",
  mp3: "audio",
  wav: "audio",
  ogg: "audio",
  flac: "audio",
  m4a: "audio",
  aac: "audio",
  pdf: "pdf",
  doc: "word",
  docx: "word",
  rtf: "word",
  odt: "word",
  xls: "spreadsheet",
  xlsx: "spreadsheet",
  csv: "spreadsheet",
  ods: "spreadsheet",
  ppt: "presentation",
  pptx: "presentation",
  odp: "presentation",
  key: "presentation",
  zip: "archive",
  rar: "archive",
  "7z": "archive",
  tar: "archive",
  gz: "archive",
  bz2: "archive",
  xz: "archive",
  js: "code",
  jsx: "code",
  ts: "code",
  tsx: "code",
  json: "code",
  html: "code",
  css: "code",
  scss: "code",
  py: "code",
  java: "code",
  go: "code",
  rs: "code",
  c: "code",
  cpp: "code",
  h: "code",
  sh: "code",
  yml: "code",
  yaml: "code",
  xml: "code",
  md: "text",
  txt: "text",
  log: "text",
  ini: "text",
  conf: "text",
};

const KIND_LABEL_KEYS: Record<AttachmentKind, MessageKey> = {
  image: "attachment.type.image",
  video: "attachment.type.video",
  audio: "attachment.type.audio",
  pdf: "attachment.type.pdf",
  word: "attachment.type.word",
  spreadsheet: "attachment.type.spreadsheet",
  presentation: "attachment.type.presentation",
  archive: "attachment.type.archive",
  code: "attachment.type.code",
  text: "attachment.type.text",
  other: "attachment.type.other",
};

export function getFileExtension(fileName: string): string {
  const baseName = fileName.split(/[\\/]/).pop() ?? fileName;
  const dotIndex = baseName.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === baseName.length - 1) return "";
  return baseName.slice(dotIndex + 1).toLowerCase();
}

export function getAttachmentKind(
  mimeType: string,
  fileName: string,
): AttachmentKind {
  const mime = (mimeType || "").toLowerCase();

  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime === "application/pdf") return "pdf";

  if (
    mime.includes("wordprocessingml") ||
    mime === "application/msword" ||
    mime === "application/rtf"
  ) {
    return "word";
  }
  if (
    mime.includes("spreadsheetml") ||
    mime === "application/vnd.ms-excel" ||
    mime === "text/csv"
  ) {
    return "spreadsheet";
  }
  if (
    mime.includes("presentationml") ||
    mime === "application/vnd.ms-powerpoint"
  ) {
    return "presentation";
  }
  if (
    mime === "application/zip" ||
    mime === "application/x-7z-compressed" ||
    mime === "application/x-rar-compressed" ||
    mime === "application/gzip" ||
    mime === "application/x-tar" ||
    mime === "application/x-bzip2" ||
    mime === "application/x-xz"
  ) {
    return "archive";
  }
  if (
    mime === "application/json" ||
    mime === "application/javascript" ||
    mime === "application/xml" ||
    mime === "text/html" ||
    mime === "text/css"
  ) {
    return "code";
  }
  if (mime.startsWith("text/")) return "text";

  return EXTENSION_KINDS[getFileExtension(fileName)] ?? "other";
}

export function getAttachmentTypeKey(kind: AttachmentKind): MessageKey {
  return KIND_LABEL_KEYS[kind];
}

export function isPreviewableAttachment(previewType: string): boolean {
  return previewType === "IMAGE" || previewType === "VIDEO";
}
