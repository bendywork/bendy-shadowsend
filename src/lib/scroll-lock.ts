import { getScrollbarCompensation } from "@/lib/scroll";

type ScrollLockStyle = {
  overflow: string;
  paddingRight: string;
};

export type ScrollLockTarget = {
  style: ScrollLockStyle;
  clientWidth: number;
};

export type BodyScrollLock = {
  /** Acquires the lock; the returned release function is idempotent. */
  lock: (
    body: ScrollLockTarget,
    root: ScrollLockTarget,
    innerWidth: number,
  ) => () => void;
  readonly activeCount: number;
};

/**
 * Reference-counted body scroll lock shared by every overlay.
 *
 * The first lock saves the inline overflow/padding, hides body overflow and
 * compensates the removed classic scrollbar. Nested overlays only increment
 * the counter; the last release restores the original inline styles.
 */
export function createBodyScrollLock(): BodyScrollLock {
  let lockCount = 0;
  let savedOverflow = "";
  let savedPaddingRight = "";

  return {
    lock(body, root, innerWidth) {
      if (lockCount === 0) {
        savedOverflow = body.style.overflow;
        savedPaddingRight = body.style.paddingRight;
        body.style.overflow = "hidden";
        const compensation = getScrollbarCompensation(
          innerWidth,
          root.clientWidth,
        );
        if (compensation > 0) {
          body.style.paddingRight = `${compensation}px`;
        }
      }
      lockCount += 1;

      let released = false;
      return () => {
        if (released) return;
        released = true;
        lockCount = Math.max(0, lockCount - 1);
        if (lockCount === 0) {
          body.style.overflow = savedOverflow;
          body.style.paddingRight = savedPaddingRight;
        }
      };
    },
    get activeCount() {
      return lockCount;
    },
  };
}

/** Singleton used by the React hook and by `Popover`. */
export const bodyScrollLock = createBodyScrollLock();
