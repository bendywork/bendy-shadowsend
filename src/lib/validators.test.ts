import { describe, expect, it } from "vitest";
import { roomAnnouncementSchema, sendMessageSchema } from "@/lib/validators";

const baseAttachment = {
  fileName: "photo.png",
  mimeType: "image/png",
  sizeBytes: 1024,
};

describe("sendMessageSchema attachment storage", () => {
  it("accepts SANG attachments backed by known sang hosts", () => {
    const parsed = sendMessageSchema.safeParse({
      attachments: [
        {
          ...baseAttachment,
          s3Key: "https://xiuxiu-pro-new.meitudata.com/posters/a.png",
          storage: "SANG",
        },
      ],
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects SANG attachments with arbitrary URLs", () => {
    const parsed = sendMessageSchema.safeParse({
      attachments: [
        {
          ...baseAttachment,
          s3Key: "https://evil.example.com/a.png",
          storage: "SANG",
        },
      ],
    });

    expect(parsed.success).toBe(false);
  });

  it("keeps legacy S3 attachments working", () => {
    const parsed = sendMessageSchema.safeParse({
      attachments: [
        {
          ...baseAttachment,
          s3Key: "rooms/room-1/photo.png",
          storage: "S3",
        },
      ],
    });

    expect(parsed.success).toBe(true);
  });
});

describe("roomAnnouncementSchema image storage", () => {
  it("rejects SANG announcement images with untrusted hosts", () => {
    const parsed = roomAnnouncementSchema.safeParse({
      newImages: [
        {
          ...baseAttachment,
          s3Key: "https://evil.example.com/a.png",
          storage: "SANG",
        },
      ],
    });

    expect(parsed.success).toBe(false);
  });

  it("accepts SANG announcement images from icve", () => {
    const parsed = roomAnnouncementSchema.safeParse({
      newImages: [
        {
          ...baseAttachment,
          s3Key: "https://file.icve.com.cn/file_doc/a.png",
          storage: "SANG",
        },
      ],
    });

    expect(parsed.success).toBe(true);
  });
});
