import type { MessageKey } from "@/lib/i18n/messages";

export type AnnouncementEditorImage = {
  id: string;
  kind: "existing" | "new";
  imageUrl: string;
  imageName: string;
  existingIndex?: number;
  file?: File;
};

export type AnnouncementImageSource = {
  imageUrl: string;
  imageName: string | null;
};

export type AnnouncementImageSelection = {
  accepted: File[];
  rejectedType: number;
  rejectedSize: number;
  rejectedLimit: number;
};

export type AnnouncementSaveInput = {
  text: string;
  keepImageIndexes: number[];
  newFiles: File[];
};

/**
 * 把服务端返回的公告图片映射成编辑器条目。existingIndex 必须保留原始下标，
 * 保存时据此告诉服务端哪些图片需要保留以及保留顺序。
 */
export function createAnnouncementEditorImages(
  images: readonly AnnouncementImageSource[],
): AnnouncementEditorImage[] {
  return images.map((image, index) => ({
    id: `announcement-existing-${index}`,
    kind: "existing",
    imageUrl: image.imageUrl,
    imageName: image.imageName ?? `announcement-${index + 1}`,
    existingIndex: index,
  }));
}

/**
 * 选择图片时统一做类型、大小与数量校验。返回被拒绝的数量，由调用方给出
 * 对应的 Toast 提示；accepted 保持用户选择顺序。
 */
export function selectAnnouncementImageFiles(
  files: readonly File[],
  currentCount: number,
  maxImages: number,
  maxBytes: number,
): AnnouncementImageSelection {
  let rejectedType = 0;
  let rejectedSize = 0;
  const valid: File[] = [];

  for (const file of files) {
    if (!file.type.startsWith("image/")) {
      rejectedType += 1;
      continue;
    }
    if (file.size > maxBytes) {
      rejectedSize += 1;
      continue;
    }
    valid.push(file);
  }

  const remaining = Math.max(0, maxImages - currentCount);
  const accepted = valid.slice(0, remaining);

  return {
    accepted,
    rejectedType,
    rejectedSize,
    rejectedLimit: valid.length - accepted.length,
  };
}

export function removeAnnouncementEditorImage(
  images: readonly AnnouncementEditorImage[],
  id: string,
): AnnouncementEditorImage[] {
  return images.filter((image) => image.id !== id);
}

/**
 * 生成公告保存请求体：已有图片按当前顺序转成 keepImageIndexes，新图片按
 * 当前顺序作为 newFiles 交给上传流程。文本统一 trim，空白公告由
 * validateAnnouncementDraft 拦截。
 */
export function buildAnnouncementSaveInput(
  text: string,
  images: readonly AnnouncementEditorImage[],
): AnnouncementSaveInput {
  const keepImageIndexes: number[] = [];
  const newFiles: File[] = [];

  for (const image of images) {
    if (image.kind === "existing" && typeof image.existingIndex === "number") {
      keepImageIndexes.push(image.existingIndex);
    } else if (image.kind === "new" && image.file) {
      newFiles.push(image.file);
    }
  }

  return {
    text: text.trim(),
    keepImageIndexes,
    newFiles,
  };
}

export function validateAnnouncementDraft(
  text: string,
  images: readonly AnnouncementEditorImage[],
): MessageKey | null {
  if (text.trim() || images.length > 0) return null;
  return "announcement.editor.empty";
}
