import { describe, expect, it } from "vitest";
import {
  COPY_FEEDBACK_DURATION_MS,
  getCopyFeedbackMessageKey,
} from "@/lib/copy-feedback";

describe("copy feedback contract", () => {
  it("keeps the shared reset duration short enough for a transient state", () => {
    expect(COPY_FEEDBACK_DURATION_MS).toBe(1600);
  });

  it("maps success to the shared copied label", () => {
    expect(getCopyFeedbackMessageKey("copied")).toBe("chat.copied");
  });

  it("maps failure to the shared failure label and idle to no message", () => {
    expect(getCopyFeedbackMessageKey("failed")).toBe("chat.copyFailed");
    expect(getCopyFeedbackMessageKey("idle")).toBeNull();
  });
});
