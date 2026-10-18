import { describe, expect, it } from "vitest";
import { GATE_CODE_LENGTH, ROOM_NAME_MAX_LENGTH } from "./form-validation";
import {
  ROOM_SETTINGS_SECTION_ORDER,
  hasGateCode,
  isGateCodeDirty,
  isRoomNameDirty,
  normalizeGateCodeInput,
  normalizeRoomNameInput,
} from "./room-settings";

describe("room settings section order", () => {
  it("keeps the irreversible danger section last", () => {
    expect(ROOM_SETTINGS_SECTION_ORDER).toEqual([
      "name",
      "gateCode",
      "joinPolicy",
      "expiry",
      "danger",
    ]);
    expect(ROOM_SETTINGS_SECTION_ORDER.at(-1)).toBe("danger");
  });
});

describe("normalizeRoomNameInput", () => {
  it("truncates to the room name limit", () => {
    expect(normalizeRoomNameInput("a".repeat(ROOM_NAME_MAX_LENGTH + 10))).toHaveLength(
      ROOM_NAME_MAX_LENGTH,
    );
  });

  it("preserves shorter values unchanged", () => {
    expect(normalizeRoomNameInput("深夜传输")).toBe("深夜传输");
  });
});

describe("normalizeGateCodeInput", () => {
  it("strips non-digits and truncates to the gate code length", () => {
    expect(normalizeGateCodeInput("12a34-5678")).toBe("123456");
    expect(normalizeGateCodeInput("12a34-5678")).toHaveLength(GATE_CODE_LENGTH);
  });

  it("returns an empty string when no digits are present", () => {
    expect(normalizeGateCodeInput("abc")).toBe("");
  });
});

describe("dirty checks", () => {
  it("ignores surrounding whitespace for room names", () => {
    expect(isRoomNameDirty("  新名称  ", "新名称")).toBe(false);
    expect(isRoomNameDirty("另一个名称", "新名称")).toBe(true);
  });

  it("compares gate codes against the current value", () => {
    expect(isGateCodeDirty("123456", "123456")).toBe(false);
    expect(isGateCodeDirty("", "123456")).toBe(true);
    expect(isGateCodeDirty("", null)).toBe(false);
  });
});

describe("hasGateCode", () => {
  it("treats null and empty values as unset", () => {
    expect(hasGateCode(null)).toBe(false);
    expect(hasGateCode("")).toBe(false);
    expect(hasGateCode("000000")).toBe(true);
  });
});
