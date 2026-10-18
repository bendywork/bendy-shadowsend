"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter(
    (element) =>
      element.getAttribute("aria-hidden") !== "true" &&
      element.getClientRects().length > 0,
  );
}

type FocusTrapOptions = {
  open: boolean;
  active: boolean;
  panelRef: RefObject<HTMLElement | null>;
  initialFocusRef?: RefObject<HTMLElement | null>;
  closeOnEsc: boolean;
  onClose: () => void;
};

// 焦点管理分三件事：
// 1. 打开时把焦点移入弹层（优先 data-autofocus / initialFocusRef）；
// 2. 只在最上层弹层劫持 Tab / Shift+Tab，形成焦点环；
// 3. 关闭时把焦点还给打开前的元素，但不抢走新弹层的焦点。
export function useFocusTrap({
  open,
  active,
  panelRef,
  initialFocusRef,
  closeOnEsc,
  onClose,
}: FocusTrapOptions) {
  const restoreTargetRef = useRef<HTMLElement | null>(null);
  const hasFocusedRef = useRef(false);

  useEffect(() => {
    if (!open) {
      hasFocusedRef.current = false;
      return;
    }

    const panel = panelRef.current;
    restoreTargetRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    return () => {
      const target = restoreTargetRef.current;
      restoreTargetRef.current = null;
      if (!target || !target.isConnected) return;

      const current = document.activeElement;
      const focusIsElsewhere =
        !current ||
        current === document.body ||
        (panel ? panel.contains(current) : false);

      if (focusIsElsewhere) {
        target.focus({ preventScroll: true });
      }
    };
  }, [open, panelRef]);

  useEffect(() => {
    if (!open || !active || hasFocusedRef.current) return;

    const panel = panelRef.current;
    if (!panel) return;

    const preferred =
      initialFocusRef?.current ??
      panel.querySelector<HTMLElement>("[data-autofocus]") ??
      getFocusableElements(panel)[0] ??
      panel;

    preferred.focus({ preventScroll: true });
    hasFocusedRef.current = true;
  }, [open, active, panelRef, initialFocusRef]);

  useEffect(() => {
    if (!open || !active) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (!closeOnEsc) return;
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;

      const focusables = getFocusableElements(panel);
      if (focusables.length === 0) {
        event.preventDefault();
        panel.focus({ preventScroll: true });
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const current = document.activeElement;
      const inside = current instanceof Node && panel.contains(current);

      if (!inside) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus({ preventScroll: true });
        return;
      }

      if (event.shiftKey && current === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, active, panelRef, closeOnEsc, onClose]);
}
