import type { MessageKey } from "@/lib/i18n/messages";
import {
  GATE_CODE_LENGTH,
  ROOM_CODE_MAX_LENGTH,
  ROOM_CODE_MIN_LENGTH,
  ROOM_NAME_MAX_LENGTH,
  validateGateCode,
  validateRoomCode,
  validateRoomName,
} from "@/lib/form-validation";

export type RoomEntryMode = "join" | "create";

export type RoomEntryValues = {
  createName: string;
  createGateCode: string;
  joinRoomCode: string;
  joinGateCode: string;
  joinInviteToken: string;
};

export type RoomEntryFieldErrors = {
  name?: MessageKey;
  gateCode?: MessageKey;
  roomCode?: MessageKey;
};

export type RoomEntryCreateValues = {
  name: string;
  gateCode: string;
};

export type RoomEntryJoinValues = {
  roomCode: string;
  gateCode: string;
  inviteToken: string;
};

export const INITIAL_ROOM_ENTRY_VALUES: RoomEntryValues = Object.freeze({
  createName: "",
  createGateCode: "",
  joinRoomCode: "",
  joinGateCode: "",
  joinInviteToken: "",
});

export function normalizeGateCodeInput(value: string): string {
  return value.replace(/\D/g, "").slice(0, GATE_CODE_LENGTH);
}

export function normalizeRoomCodeInput(value: string): string {
  return value.trim();
}

export function normalizeInviteTokenInput(value: string): string {
  return value.trim();
}

export function normalizeRoomEntryField(
  field: keyof RoomEntryValues,
  value: string,
): string {
  switch (field) {
    case "createGateCode":
    case "joinGateCode":
      return normalizeGateCodeInput(value);
    case "joinRoomCode":
      return normalizeRoomCodeInput(value);
    case "joinInviteToken":
      return normalizeInviteTokenInput(value);
    default:
      return value;
  }
}

/**
 * Validate only the active mode. Returned values are i18n keys so the dialog
 * renders the same copy as the home page in the active language.
 */
export function validateRoomEntryValues(
  mode: RoomEntryMode,
  values: RoomEntryValues,
): RoomEntryFieldErrors {
  const errors: RoomEntryFieldErrors = {};

  if (mode === "create") {
    const nameError = validateRoomName(values.createName);
    const gateCodeError = validateGateCode(values.createGateCode);
    if (nameError) errors.name = nameError;
    if (gateCodeError) errors.gateCode = gateCodeError;
    return errors;
  }

  const roomCodeError = validateRoomCode(values.joinRoomCode);
  const gateCodeError = validateGateCode(values.joinGateCode);
  if (roomCodeError) errors.roomCode = roomCodeError;
  if (gateCodeError) errors.gateCode = gateCodeError;
  return errors;
}

export function getRoomEntryErrorField(
  field: keyof RoomEntryValues,
): keyof RoomEntryFieldErrors | null {
  switch (field) {
    case "createName":
      return "name";
    case "createGateCode":
    case "joinGateCode":
      return "gateCode";
    case "joinRoomCode":
      return "roomCode";
    default:
      return null;
  }
}

/** Clear one field error without mutating the previous object. */
export function clearRoomEntryFieldError(
  errors: RoomEntryFieldErrors,
  field: keyof RoomEntryFieldErrors,
): RoomEntryFieldErrors {
  if (!errors[field]) return errors;
  const next = { ...errors };
  delete next[field];
  return next;
}

export function hasRoomEntryErrors(errors: RoomEntryFieldErrors): boolean {
  return Object.keys(errors).length > 0;
}

export function getRoomEntrySubmitKey(
  mode: RoomEntryMode,
  submitting: boolean,
): MessageKey {
  if (mode === "create") {
    return submitting ? "roomEntry.create.submitting" : "roomEntry.create.submit";
  }
  return submitting ? "roomEntry.join.submitting" : "roomEntry.join.submit";
}

/** Parameters for validators that embed limits in their copy. */
export function getRoomEntryErrorParams(
  key: MessageKey | undefined,
): Record<string, number> | undefined {
  switch (key) {
    case "form.roomNameTooLong":
      return { max: ROOM_NAME_MAX_LENGTH };
    case "form.roomCodeTooShort":
      return { min: ROOM_CODE_MIN_LENGTH };
    case "form.roomCodeTooLong":
      return { max: ROOM_CODE_MAX_LENGTH };
    case "form.gateCodeFormat":
      return { length: GATE_CODE_LENGTH };
    default:
      return undefined;
  }
}
