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

  it("accepts PIC_SL attachments", () => {
    const parsed = sendMessageSchema.parse({
      attachments: [
        {
          fileName: "report.pdf",
          mimeType: "application/pdf",
          sizeBytes: 3,
          s3Key: "https://pic.sl.al/f/pic/2026-10-18/fileid_abc_report.pdf",
          storage: "PIC_SL",
        },
      ],
    });

    expect(parsed.attachments[0]?.storage).toBe("PIC_SL");
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

  it("rejects unknown storage values", () => {
    const result = sendMessageSchema.safeParse({
      attachments: [
        {
          fileName: "report.pdf",
          mimeType: "application/pdf",
          sizeBytes: 3,
          s3Key: "key",
          storage: "UNKNOWN",
        },
      ],
    });

    expect(result.success).toBe(false);
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
