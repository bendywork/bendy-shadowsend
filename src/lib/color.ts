// Small, dependency-free color helpers shared by theme contrast checks,
// avatar foreground selection and the QR special-surface logic.

const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export function normalizeHexColor(value: string): string | null {
  const trimmed = value.trim();
  if (!HEX_COLOR_RE.test(trimmed)) {
    return null;
  }

  if (trimmed.length === 4) {
    const [, r, g, b] = trimmed;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }

  return trimmed.toLowerCase();
}

function channelToLinear(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(color: string): number | null {
  const hex = normalizeHexColor(color);
  if (!hex) {
    return null;
  }

  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);

  return (
    0.2126 * channelToLinear(red) +
    0.7152 * channelToLinear(green) +
    0.0722 * channelToLinear(blue)
  );
}

export function contrastRatio(foreground: string, background: string): number | null {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  if (foregroundLuminance === null || backgroundLuminance === null) {
    return null;
  }

  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Picks whichever of two candidate foregrounds has the higher contrast against
 * the background. Returns null when the background is not a valid hex color.
 */
export function pickReadableForeground(
  background: string,
  lightForeground = "#ffffff",
  darkForeground = "#111113",
): string | null {
  const lightContrast = contrastRatio(lightForeground, background);
  const darkContrast = contrastRatio(darkForeground, background);
  if (lightContrast === null || darkContrast === null) {
    return null;
  }

  return lightContrast >= darkContrast ? lightForeground : darkForeground;
}
