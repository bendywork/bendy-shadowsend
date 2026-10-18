import { GATE_CODE_LENGTH, ROOM_NAME_MAX_LENGTH } from "./form-validation";

export type RoomSettingsSectionId =
  | "name"
  | "gateCode"
  | "joinPolicy"
  | "expiry"
  | "danger";

/**
 * Drawer sections are intentionally ordered from low-risk edits to the
 * irreversible action, so the danger zone is always the last thing a host
 * sees before closing the drawer.
 */
export const ROOM_SETTINGS_SECTION_ORDER: readonly RoomSettingsSectionId[] = [
  "name",
  "gateCode",
  "joinPolicy",
  "expiry",
  "danger",
] as const;

export function normalizeRoomNameInput(value: string): string {
  return value.slice(0, ROOM_NAME_MAX_LENGTH);
}

export function normalizeGateCodeInput(value: string): string {
  return value.replace(/\D/g, "").slice(0, GATE_CODE_LENGTH);
}

export function isRoomNameDirty(value: string, currentName: string): boolean {
  return value.trim() !== currentName.trim();
}

export function isGateCodeDirty(
  value: string,
  currentGateCode: string | null,
): boolean {
  return value !== (currentGateCode ?? "");
}

export function hasGateCode(gateCode: string | null): boolean {
  return Boolean(gateCode && gateCode.length > 0);
}
