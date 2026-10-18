import { contrastRatio, normalizeHexColor } from "@/lib/color";

export const QR_DEFAULT_DARK = "#111113";
export const QR_DEFAULT_LIGHT = "#ffffff";
export const QR_MIN_CONTRAST = 7;

export type QrThemeColors = {
  dark: string;
  light: string;
};

type TokenReader = (token: string) => string;

/**
 * Resolves QR module/background colors from CSS tokens. QR codes must remain
 * dark-on-white in both themes, so invalid or low-contrast values fall back to
 * the fixed defaults rather than inheriting theme ink/surface colors.
 */
export function resolveQrThemeColors(read: TokenReader): QrThemeColors {
  const dark = normalizeHexColor(read("--ds-qr-dark")) ?? QR_DEFAULT_DARK;
  const light = normalizeHexColor(read("--ds-qr-light")) ?? QR_DEFAULT_LIGHT;

  const ratio = contrastRatio(dark, light);
  if (ratio === null || ratio < QR_MIN_CONTRAST) {
    return { dark: QR_DEFAULT_DARK, light: QR_DEFAULT_LIGHT };
  }

  return { dark, light };
}

export function qrColorContrast(colors: QrThemeColors): number {
  return contrastRatio(colors.dark, colors.light) ?? 0;
}
