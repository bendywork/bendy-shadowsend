import { describe, expect, it } from "vitest";

import { sendMessageSchema } from "@/lib/validators";

function attachment(overrides: Record<string, unknown> = {}) {
  return {
    fileName: "report.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1024,
    s3Key: "https://pic.sl.al/f/report.pdf",
    storage: "PIC_SL",
    ...overrides,
  };
}

describe("sendMessageSchema attachment storage", () => {
  it("accepts the relay storage identifiers", () => {
    for (const storage of ["SANG", "PIC_SL"]) {
      const parsed = sendMessageSchema.safeParse({
        attachments: [attachment({ storage })],
      });
      expect(parsed.success).toBe(true);
    }
  });

  it("accepts a serialized chunk manifest in s3Key", () => {
    const parsed = sendMessageSchema.safeParse({
      attachments: [
        attachment({
          storage: "PIC_SL",
          s3Key: `{"uploadId":"u1","chunks":"${"x".repeat(5000)}"}`,
        }),
      ],
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects unknown storage identifiers", () => {
    const parsed = sendMessageSchema.safeParse({
      attachments: [attachment({ storage: "OSS" })],
    });

    expect(parsed.success).toBe(false);
  });
});
