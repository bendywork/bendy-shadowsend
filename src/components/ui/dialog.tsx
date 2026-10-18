"use client";

import {
  useEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { FOCUSABLE_SELECTOR, resolveTabTarget } from "@/lib/a11y";

const dialogStack: HTMLElement[] = [];
let scrollLockCount = 0;
let previousBodyOverflow = "";

function getFocusableElements(panel: HTMLElement): HTMLElement[] {
  return Array.from(
    panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter(
    (element) =>
      element.getAttribute("aria-hidden") !== "true" &&
      (element.offsetParent !== null || element === document.activeElement),
  );
}

export type DialogProps = {
  open: boolean;
  onClose: () => void;
  /** Accessible name. Ignored when `labelledBy` points at a visible heading. */
  label: string;
  labelledBy?: string;
  describedBy?: string;
  children: ReactNode;
  className?: string;
  backdropClassName?: string;
  closeOnBackdrop?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
};

/**
 * Accessible modal shell (REQ-202610-0497).
 *
 * - `role="dialog"` + `aria-modal` + a real accessible name
 * - focus moves in on open, is trapped inside, and returns to the trigger
 * - Escape closes only the topmost dialog (supports nested previews)
 * - body scroll is locked while any dialog is open
 */
export function Dialog({
  open,
  onClose,
  label,
  labelledBy,
  describedBy,
  children,
  className = "w-full max-w-lg rounded-2xl border border-line bg-canvas p-5 shadow-lg",
  backdropClassName = "fixed inset-0 z-[80] flex items-center justify-center bg-overlay-strong p-4",
  closeOnBackdrop = true,
  initialFocusRef,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open || !mounted) return;

    const panel = panelRef.current;
    if (!panel) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    dialogStack.push(panel);
    scrollLockCount += 1;
    if (scrollLockCount === 1) {
      previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }

    const focusTarget =
      initialFocusRef?.current ?? getFocusableElements(panel)[0] ?? panel;
    focusTarget.focus({ preventScroll: true });

    function handleKeyDown(event: KeyboardEvent) {
      if (dialogStack[dialogStack.length - 1] !== panel) return;

      if (event.key === "Escape" && !event.isComposing) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab") return;

      const focusables = getFocusableElements(panel);
      if (focusables.length === 0) {
        event.preventDefault();
        panel.focus({ preventScroll: true });
        return;
      }

      const currentIndex = focusables.indexOf(
        document.activeElement as HTMLElement,
      );
      const targetIndex = resolveTabTarget(
        focusables.length,
        currentIndex,
        event.shiftKey,
      );

      if (
        currentIndex === -1 ||
        (event.shiftKey && currentIndex === 0) ||
        (!event.shiftKey && currentIndex === focusables.length - 1)
      ) {
        event.preventDefault();
        focusables[targetIndex]?.focus({ preventScroll: true });
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);

      const stackIndex = dialogStack.lastIndexOf(panel);
      if (stackIndex !== -1) dialogStack.splice(stackIndex, 1);

      scrollLockCount = Math.max(0, scrollLockCount - 1);
      if (scrollLockCount === 0) {
        document.body.style.overflow = previousBodyOverflow;
      }

      if (previouslyFocused?.isConnected) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [open, mounted, initialFocusRef]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className={backdropClassName}
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={labelledBy ? undefined : label}
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
        className={className}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
