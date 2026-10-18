import { describe, expect, it } from "vitest";
import { sendMessageSchema } from "@/lib/validators";

describe("sendMessageSchema attachment storage", () => {
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
});
