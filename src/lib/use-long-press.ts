"use client";

import {
  useCallback,
  useEffect,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  LONG_PRESS_DELAY_MS,
  LONG_PRESS_MOVE_TOLERANCE_PX,
} from "@/lib/touch-gestures";

type LongPressOptions = {
  delayMs?: number;
  moveTolerancePx?: number;
};

const INTERACTIVE_SELECTOR = [
  "a[href]",
  "button",
  "input",
  "textarea",
  "select",
  "[contenteditable='true']",
  "video",
  "audio",
].join(",");

/**
 * Long-press + context-menu trigger for touch surfaces.
 *
 * - Touch / pen: fires after `delayMs` while the finger stays within
 *   `moveTolerancePx`; a short vibration acknowledges the trigger.
 * - Mouse: right-click opens the same action surface.
 * - The click that browsers synthesise after a long press is swallowed so it
 *   cannot immediately hit the freshly opened sheet.
 */
export function useLongPress(
  onLongPress: (() => void) | undefined,
  {
    delayMs = LONG_PRESS_DELAY_MS,
    moveTolerancePx = LONG_PRESS_MOVE_TOLERANCE_PX,
  }: LongPressOptions = {},
) {
  const timerRef = useRef<number | null>(null);
  const originRef = useRef<{ x: number; y: number } | null>(null);
  const lastFiredAtRef = useRef(0);
  const suppressTimerRef = useRef<number | null>(null);
  const callbackRef = useRef(onLongPress);

  useEffect(() => {
    callbackRef.current = onLongPress;
  }, [onLongPress]);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const releaseClickSuppression = useCallback(() => {
    if (suppressTimerRef.current !== null) {
      window.clearTimeout(suppressTimerRef.current);
      suppressTimerRef.current = null;
    }
  }, []);

  const fire = useCallback(
    ({ fromTouch = true }: { fromTouch?: boolean } = {}) => {
      if (!callbackRef.current) return;
      lastFiredAtRef.current = Date.now();
      callbackRef.current();

      if (!fromTouch) return;

      try {
        navigator.vibrate?.(10);
      } catch {
        // Vibration is a progressive enhancement only.
      }

      const suppressClick = (event: Event) => {
        event.preventDefault();
        event.stopPropagation();
        window.removeEventListener("click", suppressClick, true);
        releaseClickSuppression();
      };
      window.addEventListener("click", suppressClick, true);
      suppressTimerRef.current = window.setTimeout(() => {
        window.removeEventListener("click", suppressClick, true);
        suppressTimerRef.current = null;
      }, 500);
    },
    [releaseClickSuppression],
  );

  useEffect(() => {
    return () => {
      clearTimer();
      releaseClickSuppression();
    };
  }, [clearTimer, releaseClickSuppression]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!callbackRef.current) return;
      if (event.pointerType === "mouse") return;
      if (event.pointerType !== "touch" && event.pointerType !== "pen") return;

      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(INTERACTIVE_SELECTOR)
      ) {
        return;
      }

      clearTimer();
      originRef.current = { x: event.clientX, y: event.clientY };
      timerRef.current = window.setTimeout(fire, delayMs);
    },
    [clearTimer, delayMs, fire],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (timerRef.current === null || !originRef.current) return;
      const distance = Math.hypot(
        event.clientX - originRef.current.x,
        event.clientY - originRef.current.y,
      );
      if (distance > moveTolerancePx) {
        clearTimer();
        originRef.current = null;
      }
    },
    [clearTimer, moveTolerancePx],
  );

  const endPress = useCallback(() => {
    clearTimer();
    originRef.current = null;
  }, [clearTimer]);

  const onContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      if (!callbackRef.current) return;
      event.preventDefault();
      if (Date.now() - lastFiredAtRef.current < 700) return;
      fire({ fromTouch: false });
    },
    [fire],
  );

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: endPress,
    onPointerCancel: endPress,
    onPointerLeave: endPress,
    onContextMenu,
  };
}
