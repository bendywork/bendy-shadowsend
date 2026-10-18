import { describe, expect, it } from "vitest";
import {
  normalizeGateCodeInput,
  normalizeRoomCodeInput,
  validateGateCode,
  validateRoomCode,
  validateRoomName,
} from "./home-form";

describe("normalizeRoomCodeInput", () => {
  it("uppercases and strips separators", () => {
    expect(normalizeRoomCodeInput(" 8dk4-a2m7qx ")).toBe("8DK4A2M7QX");
  });

  it("extracts the room code from a query invite link", () => {
    expect(
      normalizeRoomCodeInput("https://bendy.example/?room=8dk4a2m7qx&invite=abc123"),
    ).toBe("8DK4A2M7QX");
  });

  it("extracts the room code from a path invite link", () => {
    expect(
      normalizeRoomCodeInput("https://bendy.example/room/8DK4A2M7QX?invite=abc123"),
    ).toBe("8DK4A2M7QX");
  });

  it("caps the result at 10 characters", () => {
    expect(normalizeRoomCodeInput("ABCDEFGHJKLMN")).toBe("ABCDEFGHJK");
  });

  it("returns an empty string for blank input", () => {
    expect(normalizeRoomCodeInput("   ")).toBe("");
  });
});

describe("validateRoomCode", () => {
  it("requires a room code", () => {
    expect(validateRoomCode("")).toBe("required");
  });

  it("rejects codes with the wrong length", () => {
    expect(validateRoomCode("ABC123")).toBe("format");
  });

  it("rejects ambiguous letters I and O", () => {
    expect(validateRoomCode("8DK4A2M7QI")).toBe("format");
    expect(validateRoomCode("8DK4A2M7QO")).toBe("format");
  });

  it("accepts a generated room code in any case", () => {
    expect(validateRoomCode("8dk4a2m7qx")).toBeNull();
  });
});

describe("normalizeGateCodeInput", () => {
  it("keeps digits only and limits to six characters", () => {
    expect(normalizeGateCodeInput("12a34-567")).toBe("123456");
  });
});

describe("validateGateCode", () => {
  it("treats an empty gate code as optional", () => {
    expect(validateGateCode("")).toBeNull();
  });

  it("rejects partial gate codes", () => {
    expect(validateGateCode("12345")).toBe("format");
  });

  it("accepts six digits", () => {
    expect(validateGateCode("123456")).toBeNull();
  });
});

describe("validateRoomName", () => {
  it("requires a non-blank name", () => {
    expect(validateRoomName("   ")).toBe("required");
  });

  it("accepts 48 characters", () => {
    expect(validateRoomName("a".repeat(48))).toBeNull();
  });

  it("rejects names longer than 48 characters", () => {
    expect(validateRoomName("a".repeat(49))).toBe("tooLong");
  });

  it("ignores surrounding whitespace when validating", () => {
    expect(validateRoomName("  房间名称  ")).toBeNull();
  });
});
