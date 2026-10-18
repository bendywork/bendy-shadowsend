import { describe, expect, it } from "vitest";
import {
  QR_DEFAULT_DARK,
  QR_DEFAULT_LIGHT,
  QR_MIN_CONTRAST,
  qrColorContrast,
  resolveQrThemeColors,
} from "@/lib/qr-theme";

function reader(values: Record<string, string>) {
  return (token: string) => values[token] ?? "";
}

describe("QR theme colors", () => {
  it("uses the theme-invariant tokens when valid", () => {
    const colors = resolveQrThemeColors(
      reader({ "--ds-qr-dark": "#111113", "--ds-qr-light": "#ffffff" }),
    );
    expect(colors).toEqual({ dark: "#111113", light: "#ffffff" });
    expect(qrColorContrast(colors)).toBeGreaterThanOrEqual(QR_MIN_CONTRAST);
  });

  it("falls back to the defaults when tokens are missing or invalid", () => {
    expect(resolveQrThemeColors(reader({}))).toEqual({
      dark: QR_DEFAULT_DARK,
      light: QR_DEFAULT_LIGHT,
    });
    expect(
      resolveQrThemeColors(reader({ "--ds-qr-dark": "black", "--ds-qr-light": "#fff" })),
    ).toEqual({ dark: QR_DEFAULT_DARK, light: QR_DEFAULT_LIGHT });
  });

  it("rejects low-contrast QR colors so codes stay scannable", () => {
    expect(
      resolveQrThemeColors(reader({ "--ds-qr-dark": "#ffffff", "--ds-qr-light": "#f5f5f7" })),
    ).toEqual({ dark: QR_DEFAULT_DARK, light: QR_DEFAULT_LIGHT });
  });
});
