import { describe, expect, it } from "vitest";
import {
  GATE_CODE_LENGTH,
  ROOM_CODE_MAX_LENGTH,
  ROOM_CODE_MIN_LENGTH,
  ROOM_NAME_MAX_LENGTH,
  validateGateCode,
  validateRoomCode,
  validateRoomName,
} from "@/lib/form-validation";

describe("validateRoomName", () => {
  it("requires a non-blank name", () => {
    expect(validateRoomName("")).toBe("form.roomNameRequired");
    expect(validateRoomName("   ")).toBe("form.roomNameRequired");
  });

  it("accepts names at the length limit and rejects longer ones", () => {
    expect(validateRoomName("a".repeat(ROOM_NAME_MAX_LENGTH))).toBeNull();
    expect(validateRoomName("a".repeat(ROOM_NAME_MAX_LENGTH + 1))).toBe("form.roomNameTooLong");
  });
});

describe("validateGateCode", () => {
  it("allows an empty gate code (feature disabled)", () => {
    expect(validateGateCode("")).toBeNull();
  });

  it("requires exactly six digits when present", () => {
    expect(validateGateCode("123456")).toBeNull();
    expect(validateGateCode("12345")).toBe("form.gateCodeFormat");
    expect(validateGateCode("1234567")).toBe("form.gateCodeFormat");
    expect(validateGateCode("12345a")).toBe("form.gateCodeFormat");
    expect(validateGateCode("123456".slice(0, GATE_CODE_LENGTH - 1))).toBe("form.gateCodeFormat");
  });
});

describe("validateRoomCode", () => {
  it("requires a room code", () => {
    expect(validateRoomCode("")).toBe("form.roomCodeRequired");
    expect(validateRoomCode("  ")).toBe("form.roomCodeRequired");
  });

  it("enforces the min/max length boundaries", () => {
    expect(validateRoomCode("a".repeat(ROOM_CODE_MIN_LENGTH - 1))).toBe("form.roomCodeTooShort");
    expect(validateRoomCode("a".repeat(ROOM_CODE_MIN_LENGTH))).toBeNull();
    expect(validateRoomCode("a".repeat(ROOM_CODE_MAX_LENGTH))).toBeNull();
    expect(validateRoomCode("a".repeat(ROOM_CODE_MAX_LENGTH + 1))).toBe("form.roomCodeTooLong");
  });
});
