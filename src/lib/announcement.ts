import type { AttachmentStorage } from "@prisma/client";
import { type ChunkManifest, remoteAttachmentSchema } from "@/lib/attachment-storage";

export type AnnouncementImage = {
  s3Key: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storage: AttachmentStorage;
  chunkManifest?: ChunkManifest | null;
};

type AnnouncementFields = {
  announcementImageKey: string | null;
  announcementImageName: string | null;
  announcementImageStorage: AttachmentStorage | null;
};

function normalizeAnnouncementImage(value: unknown): AnnouncementImage | null {
  const parsed = remoteAttachmentSchema.safeParse(value);
  return parsed.success && parsed.data.mimeType.startsWith("image/") ? parsed.data : null;
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

      return normalized;
    } catch {
      return [];
    }
  }

  return [];
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
