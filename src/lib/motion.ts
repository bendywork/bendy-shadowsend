/**
 * Motion contract shared by CSS and JS (REQ-202610-0498 / ui-35).
 *
 * CSS tokens live in `src/app/globals.css` (`--ds-duration-*` / `--ds-ease-*`).
 * Keep the numeric scale below in sync with those tokens: `motion.test.ts`
 * parses the stylesheet and fails when the two drift apart.
 */

export const MOTION_DURATIONS_MS = {
  instant: 0,
  fast: 120,
  base: 180,
  slow: 280,
  slower: 420,
} as const;

export type MotionDurationName = keyof typeof MOTION_DURATIONS_MS;

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export type ScrollBehavior = "auto" | "smooth";

/** Minimal surface used by tests; a real `window` satisfies it. */
export type MotionEnvironment = {
  matchMedia?: (query: string) => { matches: boolean } | null;
};

function defaultEnvironment(): MotionEnvironment | undefined {
  return typeof window === "undefined" ? undefined : window;
}

/** Whether the user asked the OS/browser to reduce non-essential motion. */
export function prefersReducedMotion(
  environment: MotionEnvironment | undefined = defaultEnvironment(),
): boolean {
  if (!environment?.matchMedia) return false;

  try {
    return environment.matchMedia(REDUCED_MOTION_QUERY)?.matches ?? false;
  } catch {
    return false;
  }
}

/**
 * Scroll behavior for `scrollIntoView` / `scrollTo`.
 * Reduced motion resolves to `auto` so programmatic scrolling stays instant.
 */
export function getScrollBehavior(
  environment: MotionEnvironment | undefined = defaultEnvironment(),
): ScrollBehavior {
  return prefersReducedMotion(environment) ? "auto" : "smooth";
}
