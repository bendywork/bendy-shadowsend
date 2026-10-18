/**
 * Scroll container contract — REQ-202610-0507 / ui-44.
 *
 * Every dedicated scroll region uses the `.scroll-area` classes from
 * `src/app/scroll.css`, declares a single overflow axis, and keeps a stable
 * scrollbar gutter. The constants here mirror the CSS tokens; the contract
 * test in `src/lib/scroll.test.ts` keeps both sides in sync.
 */

/** Must match `--ds-scrollbar-size` in `globals.css`. */
export const SCROLLBAR_SIZE_PX = 8;

export const SCROLL_AXES = ["y", "x", "both"] as const;

export type ScrollAxis = (typeof SCROLL_AXES)[number];

/**
 * Returns the class list for a scroll region. `y` is the default because
 * vertical lists (rooms, messages, members) are the dominant pattern.
 */
export function getScrollAreaClassName(axis: ScrollAxis = "y"): string {
  return `scroll-area scroll-area--${axis}`;
}

/**
 * Width of the classic scrollbar that disappears when body scrolling is
 * locked. Invalid measurements are treated as "no compensation" so a broken
 * layout cannot inject `NaNpx` into the document.
 */
export function getScrollbarCompensation(
  innerWidth: number,
  clientWidth: number,
): number {
  if (!Number.isFinite(innerWidth) || !Number.isFinite(clientWidth)) {
    return 0;
  }
  return Math.max(0, Math.round(innerWidth - clientWidth));
}
