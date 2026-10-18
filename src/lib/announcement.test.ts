import { AttachmentStorage } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { parseAnnouncementImages } from "@/lib/announcement";

describe("parseAnnouncementImages", () => {
  it("preserves relay storage identifiers", () => {
    const images = parseAnnouncementImages({
      announcementImageKey: JSON.stringify([
        {
          s3Key: "https://file.sang.pub/f/one.png",
          fileName: "one.png",
          mimeType: "image/png",
          sizeBytes: 10,
          storage: "SANG",
        },
        {
          s3Key: "https://pic.sl.al/f/two.png",
          fileName: "two.png",
          mimeType: "image/png",
          sizeBytes: 20,
          storage: "PIC_SL",
        },
      ]),
      announcementImageName: null,
      announcementImageStorage: null,
    });

    expect(images.map((image) => image.storage)).toEqual([
      AttachmentStorage.SANG,
      AttachmentStorage.PIC_SL,
    ]);
  });

  it("drops stored images whose storage is no longer supported", () => {
    const images = parseAnnouncementImages({
      announcementImageKey: JSON.stringify([
        {
          s3Key: "rooms/legacy.png",
          fileName: "legacy.png",
          mimeType: "image/png",
          sizeBytes: 10,
          storage: "S3",
        },
      ]),
      announcementImageName: "legacy.png",
      announcementImageStorage: null,
    });

    expect(images).toEqual([]);
  });

  it("preserves relay storage on the legacy single-image fields", () => {
    const images = parseAnnouncementImages({
      announcementImageKey: "https://pic.sl.al/f/three.png",
      announcementImageName: "three.png",
      announcementImageStorage: AttachmentStorage.PIC_SL,
    });

    expect(images).toHaveLength(1);
    expect(images[0].storage).toBe(AttachmentStorage.PIC_SL);
  });
});
