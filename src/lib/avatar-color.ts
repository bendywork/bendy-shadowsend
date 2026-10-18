/**
 * Avatar colours are part of the monochrome design system (dc-02).
 *
 * New users get one of the neutral palette values below. Existing users may
 * still have colours from older palettes stored in the database, including
 * saturated blues/teals, so every render path resolves the stored value
 * through `resolveAvatarColor()` and falls back to a neutral value instead of
 * painting a coloured accent.
 */

export const AVATAR_COLOR_POOL = [
  "#3f3f46",
  "#52525b",
  "#71717a",
  "#a1a1aa",
  "#27272a",
  "#404040",
  "#737373",
  "#6b6b73",
  "#4b4b52",
] as const;

/** Maximum R/G/B channel spread that still counts as a neutral gray. */
const NEUTRAL_CHANNEL_TOLERANCE = 24;

function expandShortHex(value: string): string {
  return `#${value
    .slice(1)
    .split("")
    .map((char) => char + char)
    .join("")}`;
}

function normalizeHex(value: string): string | null {
  const trimmed = value.trim();
  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    return expandShortHex(trimmed).toLowerCase();
  }
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return null;
}

function parseRgb(hex: string): [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

export function isNeutralAvatarColor(value: string): boolean {
  const hex = normalizeHex(value);
  if (!hex) {
    return false;
  }
  const [red, green, blue] = parseRgb(hex);
  return Math.max(red, green, blue) - Math.min(red, green, blue) <= NEUTRAL_CHANNEL_TOLERANCE;
}

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Returns a guaranteed-neutral background colour for an avatar.
 *
 * - Current/legacy neutral values are preserved (normalized to lowercase).
 * - Coloured or malformed values fall back to a stable palette entry derived
 *   from `seed`, so the same user keeps the same fallback across renders.
 */
export function resolveAvatarColor(color: string | null | undefined, seed: string): string {
  const normalized = color ? normalizeHex(color) : null;
  if (normalized && isNeutralAvatarColor(normalized)) {
    return normalized;
  }
  return AVATAR_COLOR_POOL[hashSeed(seed || "U") % AVATAR_COLOR_POOL.length];
}
