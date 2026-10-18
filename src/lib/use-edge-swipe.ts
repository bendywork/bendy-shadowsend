"use client";

import { useEffect, useRef } from "react";
import {
  resolveEdgeSwipe,
  type PanelSide,
} from "@/lib/touch-gestures";

type EdgeSwipeOptions = {
  /** Only listen while the mobile shell is the active surface. */
  enabled: boolean;
  /** Drawer currently open, if any. */
  openSide: PanelSide | null;
  onOpen: (side: PanelSide) => void;
  onClose: () => void;
};

type SwipeStart = {
  startX: number;
  startY: number;
  startedAt: number;
  openSide: PanelSide | null;
};

const FORM_CONTROL_SELECTOR =
  "input, textarea, select, [contenteditable='true']";

/**
 * Listens for one-finger edge swipes on the window.
 *
 * The gesture math lives in `touch-gestures.ts`; this hook only owns the
 * browser event plumbing and keeps the latest callbacks in refs so the
 * listeners are installed once per enabled cycle.
 */
export function useEdgeSwipe({
  enabled,
  openSide,
  onOpen,
  onClose,
}: EdgeSwipeOptions) {
  const startRef = useRef<SwipeStart | null>(null);
  const callbacksRef = useRef({ openSide, onOpen, onClose });

  useEffect(() => {
    callbacksRef.current = { openSide, onOpen, onClose };
  }, [openSide, onOpen, onClose]);

  useEffect(() => {
    if (!enabled) return;

    function handleTouchStart(event: TouchEvent) {
      // The drawer shell only exists below the xl breakpoint.
      if (window.innerWidth >= 1280) {
        startRef.current = null;
        return;
      }
      if (event.touches.length !== 1) {
        startRef.current = null;
        return;
      }

      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(FORM_CONTROL_SELECTOR)
      ) {
        startRef.current = null;
        return;
      }

      const touch = event.touches[0];
      startRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        startedAt: performance.now(),
        openSide: callbacksRef.current.openSide,
      };
    }

    function handleTouchEnd(event: TouchEvent) {
      const start = startRef.current;
      startRef.current = null;
      if (!start || event.changedTouches.length !== 1) return;

      const touch = event.changedTouches[0];
      const result = resolveEdgeSwipe({
        startX: start.startX,
        startY: start.startY,
        endX: touch.clientX,
        endY: touch.clientY,
        durationMs: performance.now() - start.startedAt,
        viewportWidth: window.innerWidth,
        openSide: start.openSide,
      });

      if (!result) return;
      if (result.action === "open") {
        callbacksRef.current.onOpen(result.side);
      } else {
        callbacksRef.current.onClose();
      }
    }

    function handleTouchCancel() {
      startRef.current = null;
    }

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });
    window.addEventListener("touchcancel", handleTouchCancel, {
      passive: true,
    });

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", handleTouchCancel);
    };
  }, [enabled]);
}
