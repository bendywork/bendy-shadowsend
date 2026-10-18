import type { MessageKey } from "@/lib/i18n/messages";

export const ROOM_NAME_MAX_LENGTH = 48;
export const ROOM_CODE_MIN_LENGTH = 4;
export const ROOM_CODE_MAX_LENGTH = 64;
export const GATE_CODE_LENGTH = 6;

/**
 * Client-side field validators shared by the home page, the in-room entry
 * dialog and the room settings panel. They return an i18n key so every
 * surface renders the same message under its own language.
 */
export function validateRoomName(value: string): MessageKey | null {
  const normalized = value.trim();
  if (!normalized) return "form.roomNameRequired";
  if (normalized.length > ROOM_NAME_MAX_LENGTH) return "form.roomNameTooLong";
  return null;
}

export function validateGateCode(value: string): MessageKey | null {
  const normalized = value.trim();
  if (!normalized) return null;
  if (!new RegExp(`^\\d{${GATE_CODE_LENGTH}}$`).test(normalized)) {
    return "form.gateCodeFormat";
  }
  return null;
}

export function validateRoomCode(value: string): MessageKey | null {
  const normalized = value.trim();
  if (!normalized) return "form.roomCodeRequired";
  if (normalized.length < ROOM_CODE_MIN_LENGTH) return "form.roomCodeTooShort";
  if (normalized.length > ROOM_CODE_MAX_LENGTH) return "form.roomCodeTooLong";
  return null;
}
