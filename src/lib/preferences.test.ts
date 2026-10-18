import { describe, expect, it } from "vitest";
import { ENTER_TO_SEND_STORAGE_KEY, readStoredBoolean } from "@/lib/preferences";

describe("readStoredBoolean", () => {
  it("reads explicit true and false values", () => {
    expect(readStoredBoolean("1", false)).toBe(true);
    expect(readStoredBoolean("0", true)).toBe(false);
  });

  it("keeps the fallback when the preference has never been saved", () => {
    expect(readStoredBoolean(null, true)).toBe(true);
    expect(readStoredBoolean(null, false)).toBe(false);
  });

  it("ignores malformed stored values", () => {
    expect(readStoredBoolean("true", false)).toBe(false);
    expect(readStoredBoolean("", true)).toBe(true);
  });

  it("uses a dedicated storage key for enter-to-send", () => {
    expect(ENTER_TO_SEND_STORAGE_KEY).toBe("tb:enter-to-send");
  });
});
