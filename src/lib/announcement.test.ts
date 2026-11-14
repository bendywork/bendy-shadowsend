import { describe, expect, it } from "vitest";
import { parseAnnouncementImages, serializeAnnouncementImages } from "@/lib/announcement";
import type { AnnouncementImage } from "@/lib/announcement";

const image: AnnouncementImage = {
  storage: "REMOTE", s3Key: "https://s3v2.lamen.top/image.png", fileName: "image.png", mimeType: "image/png", sizeBytes: 80,
};

describe("unified announcement images", () => {
  it("round-trips complete remote image metadata", () => {
    expect(parseAnnouncementImages(serializeAnnouncementImages([image]))).toEqual([{ ...image, chunkManifest: null }]);
  });
  it("drops malformed and retired images without treating JSON as a file key", () => {
    const fields = { announcementImageKey: JSON.stringify([{ ...image, storage: "S3" }, { ...image, s3Key: "https://evil.test/image.png" }]), announcementImageName: null, announcementImageStorage: image.storage };
    expect(parseAnnouncementImages(fields)).toEqual([]);
  });
  it("retains valid images in a mixed historical JSON list", () => {
    const fields = { announcementImageKey: JSON.stringify([{ ...image, storage: "DUFS" }, image]), announcementImageName: null, announcementImageStorage: image.storage };
    expect(parseAnnouncementImages(fields)).toHaveLength(1);
  });
});
