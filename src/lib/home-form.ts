export const ROOM_CODE_LENGTH = 10;
export const ROOM_NAME_MAX_LENGTH = 48;
export const GATE_CODE_LENGTH = 6;

// 房间号由 room-service 的 customAlphabet 生成：大写字母（不含 I/O）+ 2-9。
const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{10}$/;

export type RoomCodeValidation = "required" | "format" | null;
export type RoomNameValidation = "required" | "tooLong" | null;
export type GateCodeValidation = "format" | null;

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** 去掉分隔符并转大写，最多保留 10 位。 */
export function sanitizeRoomCode(value: string) {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, ROOM_CODE_LENGTH);
}

/**
 * 接受裸房间号、邀请链接（?room=CODE 或 /room/CODE），统一归一化为房间号。
 */
export function normalizeRoomCodeInput(raw: string) {
  const value = raw.trim();
  if (!value) return "";

  const queryMatch = value.match(/[?&]room=([^&#\s]+)/i);
  if (queryMatch) return sanitizeRoomCode(safeDecode(queryMatch[1]));

  const pathMatch = value.match(/\/room\/([^/?#\s]+)/i);
  if (pathMatch) return sanitizeRoomCode(safeDecode(pathMatch[1]));

  return sanitizeRoomCode(value);
}

/** 门禁码只保留数字，最多 6 位。 */
export function normalizeGateCodeInput(raw: string) {
  return raw.replace(/\D/g, "").slice(0, GATE_CODE_LENGTH);
}

export function validateRoomCode(raw: string): RoomCodeValidation {
  const code = normalizeRoomCodeInput(raw);
  if (!code) return "required";
  return ROOM_CODE_PATTERN.test(code) ? null : "format";
}

export function validateRoomName(raw: string): RoomNameValidation {
  const name = raw.trim();
  if (!name) return "required";
  return name.length > ROOM_NAME_MAX_LENGTH ? "tooLong" : null;
}

/** 门禁码是可选项；只有填写了但不是 6 位数字时才报错。 */
export function validateGateCode(raw: string): GateCodeValidation {
  if (!raw) return null;
  return /^\d{6}$/.test(raw) ? null : "format";
}
