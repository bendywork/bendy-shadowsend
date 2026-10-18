/**
 * Small, DOM-free accessibility helpers (REQ-202610-0497).
 * Keeping the focus maths pure makes it testable in the project's node
 * Vitest environment while the dialog component owns the DOM plumbing.
 */

export const FOCUSABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  "object",
  "embed",
  "audio[controls]",
  "video[controls]",
  "[contenteditable]:not([contenteditable='false'])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

/**
 * Index that Tab / Shift+Tab should land on inside a focus trap.
 * Returns -1 when there is nothing focusable.
 */
export function resolveTabTarget(
  count: number,
  currentIndex: number,
  shiftKey: boolean,
): number {
  if (count <= 0) return -1;
  if (currentIndex < 0 || currentIndex >= count) {
    return shiftKey ? count - 1 : 0;
  }
  return shiftKey
    ? (currentIndex - 1 + count) % count
    : (currentIndex + 1) % count;
}

/** Index movement for a WAI-ARIA menu; null means "not a menu key". */
export function resolveMenuTarget(
  count: number,
  currentIndex: number,
  key: string,
): number | null {
  if (count <= 0) return null;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  if (key === "ArrowDown") {
    return currentIndex < 0 ? 0 : (currentIndex + 1) % count;
  }
  if (key === "ArrowUp") {
    return currentIndex < 0 ? count - 1 : (currentIndex - 1 + count) % count;
  }
  return null;
}

/** Join ids for aria-describedby, dropping empty entries. */
export function buildDescribedBy(
  ...ids: Array<string | false | null | undefined>
): string | undefined {
  const present = ids.filter((id): id is string => Boolean(id));
  return present.length > 0 ? present.join(" ") : undefined;
}
