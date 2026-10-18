import { pickReadableForeground } from "@/lib/color";

/**
 * Avatar colors come from a neutral pool that includes both very dark and
 * mid-light grays. A fixed white foreground fails on the light end, so pick the
 * higher-contrast foreground per color instead.
 */
export function resolveAvatarForeground(background: string): string | null {
  return pickReadableForeground(background);
}
