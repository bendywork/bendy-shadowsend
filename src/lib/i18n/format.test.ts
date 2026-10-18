import { describe, expect, it } from "vitest";
import { formatDateTime } from "./format";

describe("formatDateTime", () => {
  it("returns a placeholder for invalid input", () => {
    expect(formatDateTime("not-a-date", "zh")).toBe("--");
    expect(formatDateTime("", "en")).toBe("--");
  });

  it("formats valid timestamps for both languages", () => {
    const value = "2026-10-18T12:34:56.000Z";

    expect(formatDateTime(value, "zh")).not.toBe("--");
    expect(formatDateTime(value, "en")).not.toBe("--");
  });
});
