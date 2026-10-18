import type { AdBoardItem } from "@/types/chat";

/** Dwell time for a single ad before the ticker advances. */
export const AD_CAROUSEL_INTERVAL_MS = 4200;
/** Slide transition duration; must stay below the dwell time. */
export const AD_CAROUSEL_SLIDE_MS = 320;

export type AdSlide = {
  current: AdBoardItem | null;
  next: AdBoardItem | null;
};

/**
 * Keep the active index inside the list. An empty list always resolves to 0,
 * so callers can safely render before checking `length`.
 */
export function clampAdIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return ((index % length) + length) % length;
}

export function getNextAdIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return (clampAdIndex(index, length) + 1) % length;
}

/** Auto-rotation only makes sense with multiple items and while not paused. */
export function shouldAutoAdvance(itemCount: number, paused: boolean): boolean {
  return itemCount > 1 && !paused;
}

/**
 * Resolve the visible item and the item waiting below the viewport.
 * The next item is pre-rendered so the transform transition can slide it in.
 */
export function getAdSlide(items: AdBoardItem[], index: number): AdSlide {
  if (items.length === 0) {
    return { current: null, next: null };
  }

  const currentIndex = clampAdIndex(index, items.length);
  return {
    current: items[currentIndex],
    next: items.length > 1 ? items[(currentIndex + 1) % items.length] : null,
  };
}

/**
 * Drop blank entries and trim content without mutating the source list.
 * Keeps `color` / `url` untouched for API compatibility even though the
 * monochrome ticker no longer renders per-ad colors.
 */
export function normalizeAdItems(items: AdBoardItem[]): AdBoardItem[] {
  return items
    .filter((item) => item.content.trim().length > 0)
    .map((item) => ({ ...item, content: item.content.trim() }));
}
