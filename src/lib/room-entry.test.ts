import { describe, expect, it } from "vitest";
import {
  GATE_CODE_LENGTH,
  ROOM_CODE_MAX_LENGTH,
  ROOM_CODE_MIN_LENGTH,
  ROOM_NAME_MAX_LENGTH,
} from "@/lib/form-validation";
import {
  clearRoomEntryFieldError,
  getRoomEntryErrorField,
  getRoomEntryErrorParams,
  getRoomEntrySubmitKey,
  hasRoomEntryErrors,
  INITIAL_ROOM_ENTRY_VALUES,
  normalizeGateCodeInput,
  normalizeRoomEntryField,
  validateRoomEntryValues,
  type RoomEntryValues,
} from "@/lib/room-entry";

const validValues: RoomEntryValues = {
  createName: "周末放映室",
  createGateCode: "123456",
  joinRoomCode: "8DK1A2M7QX",
  joinGateCode: "654321",
  joinInviteToken: "invite-token",
};

describe("room entry input normalization", () => {
  it("keeps digits only and caps gate codes at six characters", () => {
    expect(normalizeGateCodeInput("12a34 56b789")).toBe("123456");
    expect(normalizeGateCodeInput("")).toBe("");
  });

  it("trims room codes and invite tokens", () => {
    expect(normalizeRoomEntryField("joinRoomCode", "  ABC123  ")).toBe("ABC123");
    expect(normalizeRoomEntryField("joinInviteToken", "  token  ")).toBe("token");
    expect(normalizeRoomEntryField("createName", "  name  ")).toBe("  name  ");
  });
});

describe("validateRoomEntryValues", () => {
  it("requires a room name when creating", () => {
    const errors = validateRoomEntryValues("create", {
      ...validValues,
      createName: "   ",
    });
    expect(errors).toEqual({ name: "form.roomNameRequired" });
  });

  it("rejects an overlong room name", () => {
    const errors = validateRoomEntryValues("create", {
      ...validValues,
      createName: "x".repeat(ROOM_NAME_MAX_LENGTH + 1),
    });
    expect(errors).toEqual({ name: "form.roomNameTooLong" });
  });

  it("rejects malformed gate codes on create and join", () => {
    expect(
      validateRoomEntryValues("create", { ...validValues, createGateCode: "12ab" }),
    ).toEqual({ gateCode: "form.gateCodeFormat" });
    expect(
      validateRoomEntryValues("join", { ...validValues, joinGateCode: "123" }),
    ).toEqual({ gateCode: "form.gateCodeFormat" });
  });

  it("accepts valid create and join values", () => {
    expect(validateRoomEntryValues("create", validValues)).toEqual({});
    expect(validateRoomEntryValues("join", validValues)).toEqual({});
  });

  it("requires a room code and enforces its length bounds", () => {
    expect(
      validateRoomEntryValues("join", { ...validValues, joinRoomCode: " " }),
    ).toEqual({ roomCode: "form.roomCodeRequired" });
    expect(
      validateRoomEntryValues("join", {
        ...validValues,
        joinRoomCode: "x".repeat(ROOM_CODE_MIN_LENGTH - 1),
      }),
    ).toEqual({ roomCode: "form.roomCodeTooShort" });
    expect(
      validateRoomEntryValues("join", {
        ...validValues,
        joinRoomCode: "x".repeat(ROOM_CODE_MAX_LENGTH + 1),
      }),
    ).toEqual({ roomCode: "form.roomCodeTooLong" });
  });
});

describe("room entry error helpers", () => {
  it("maps controls to their error slots", () => {
    expect(getRoomEntryErrorField("createName")).toBe("name");
    expect(getRoomEntryErrorField("createGateCode")).toBe("gateCode");
    expect(getRoomEntryErrorField("joinGateCode")).toBe("gateCode");
    expect(getRoomEntryErrorField("joinRoomCode")).toBe("roomCode");
    expect(getRoomEntryErrorField("joinInviteToken")).toBeNull();
  });

  it("clears one error immutably and keeps the same object when absent", () => {
    const errors = { name: "form.roomNameRequired" as const, gateCode: "form.gateCodeFormat" as const };
    const next = clearRoomEntryFieldError(errors, "name");
    expect(next).toEqual({ gateCode: "form.gateCodeFormat" });
    expect(errors).toEqual({
      name: "form.roomNameRequired",
      gateCode: "form.gateCodeFormat",
    });
    expect(clearRoomEntryFieldError(next, "roomCode")).toBe(next);
  });

  it("detects whether any error remains", () => {
    expect(hasRoomEntryErrors({})).toBe(false);
    expect(hasRoomEntryErrors({ roomCode: "form.roomCodeRequired" })).toBe(true);
  });

  it("selects localized submit copy for each mode and state", () => {
    expect(getRoomEntrySubmitKey("join", false)).toBe("roomEntry.join.submit");
    expect(getRoomEntrySubmitKey("join", true)).toBe("roomEntry.join.submitting");
    expect(getRoomEntrySubmitKey("create", false)).toBe("roomEntry.create.submit");
    expect(getRoomEntrySubmitKey("create", true)).toBe(
      "roomEntry.create.submitting",
    );
  });

  it("provides limits for parameterized validation copy", () => {
    expect(getRoomEntryErrorParams("form.roomNameTooLong")).toEqual({
      max: ROOM_NAME_MAX_LENGTH,
    });
    expect(getRoomEntryErrorParams("form.roomCodeTooShort")).toEqual({
      min: ROOM_CODE_MIN_LENGTH,
    });
    expect(getRoomEntryErrorParams("form.roomCodeTooLong")).toEqual({
      max: ROOM_CODE_MAX_LENGTH,
    });
    expect(getRoomEntryErrorParams("form.gateCodeFormat")).toEqual({
      length: GATE_CODE_LENGTH,
    });
    expect(getRoomEntryErrorParams("form.roomCodeRequired")).toBeUndefined();
  });
});

describe("initial room entry values", () => {
  it("starts every field empty", () => {
    expect(INITIAL_ROOM_ENTRY_VALUES).toEqual({
      createName: "",
      createGateCode: "",
      joinRoomCode: "",
      joinGateCode: "",
      joinInviteToken: "",
    });
  });
});
