import { AttachmentStorage } from "@prisma/client";

export type AnnouncementImage = {
  s3Key: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storage: AttachmentStorage;
};

type AnnouncementFields = {
  announcementImageKey: string | null;
  announcementImageName: string | null;
  announcementImageStorage: AttachmentStorage | null;
};

const isAttachmentStorage = (
  value: unknown,
): value is AttachmentStorage => value === "S3" || value === "DUFS";

function normalizeAnnouncementImage(value: unknown): AnnouncementImage | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Partial<AnnouncementImage> & {
    key?: string;
    name?: string;
  };
  const s3Key =
    typeof candidate.s3Key === "string"
      ? candidate.s3Key
      : typeof candidate.key === "string"
        ? candidate.key
        : null;
  if (!s3Key) return null;

  const fileName =
    typeof candidate.fileName === "string"
      ? candidate.fileName
      : typeof candidate.name === "string"
        ? candidate.name
        : "announcement-image";

  const mimeType =
    typeof candidate.mimeType === "string"
      ? candidate.mimeType
      : "image/*";
  const sizeBytes =
    typeof candidate.sizeBytes === "number" &&
    Number.isFinite(candidate.sizeBytes) &&
    candidate.sizeBytes >= 0
      ? candidate.sizeBytes
      : 0;
  const storage = isAttachmentStorage(candidate.storage)
    ? candidate.storage
    : AttachmentStorage.S3;

  return {
    s3Key,
    fileName,
    mimeType,
    sizeBytes,
    storage,
  };
}

export function parseAnnouncementImages(
  fields: AnnouncementFields,
): AnnouncementImage[] {
  const raw = fields.announcementImageKey;
  if (!raw) return [];

  const trimmed = raw.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      const list = Array.isArray(parsed)
        ? parsed
        : parsed &&
            typeof parsed === "object" &&
            Array.isArray((parsed as { images?: unknown[] }).images)
          ? (parsed as { images: unknown[] }).images
          : [];

      const normalized = list
        .map(normalizeAnnouncementImage)
        .filter((item): item is AnnouncementImage => Boolean(item));

      if (normalized.length > 0) {
        return normalized;
      }
    } catch {
      // Fallback to legacy format below.
    }
  }

  if (!fields.announcementImageStorage) {
    return [];
  }

  return [
    {
      s3Key: raw,
      fileName: fields.announcementImageName ?? "announcement-image",
      mimeType: "image/*",
      sizeBytes: 0,
      storage: fields.announcementImageStorage,
    },
  ];
}

export function serializeAnnouncementImages(images: AnnouncementImage[]) {
  if (images.length === 0) {
    return {
      announcementImageKey: null,
      announcementImageName: null,
      announcementImageStorage: null,
    };
  }

  const lastImage = images.at(-1) ?? images[0];

  return {
    announcementImageKey: JSON.stringify(images),
    announcementImageName: lastImage.fileName,
    announcementImageStorage: lastImage.storage,
  };
}

export function buildAnnouncementImageViews(
  roomCode: string,
  images: AnnouncementImage[],
) {
  return images.map((image, index) => ({
    imageUrl: `/api/rooms/${encodeURIComponent(
      roomCode,
    )}/announcement/image?index=${index}`,
    imageName: image.fileName,
  }));
}
