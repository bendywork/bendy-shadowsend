"use client";

import { useEffect } from "react";
import { bodyScrollLock } from "@/lib/scroll-lock";

/**
 * Locks body scrolling while `active` is true and restores the previous
 * inline styles on unmount. Multiple overlays share one reference count.
 */
export function useBodyScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    return bodyScrollLock.lock(
      document.body,
      document.documentElement,
      window.innerWidth,
    );
  }, [active]);
}
