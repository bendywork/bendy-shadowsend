"use client";

import { useEffect, useRef, type RefObject } from "react";
import { FOCUSABLE_SELECTOR, getFocusTrapIndex } from "@/lib/keyboard";

type DialogKeyboardOptions = {
  active: boolean;
  containerRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  closeDisabled?: boolean;
};

// 多层弹层栈：只有最上层响应 Esc / Tab，避免图片查看器关闭时连带关闭公告弹窗。
const dialogStack: symbol[] = [];

function isElementVisible(element: HTMLElement): boolean {
  if (element.getClientRects().length === 0) return false;
  return !element.closest('[aria-hidden="true"]');
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    isElementVisible,
  );
}

/**
 * 对话框键盘契约：
 * - 打开时记录触发元素，焦点移入 [data-autofocus] 或首个可聚焦元素；
 * - Tab / Shift+Tab 在容器内循环；
 * - Esc 关闭（closeDisabled 时忽略）；
 * - 锁定 body 滚动并补偿滚动条宽度；
 * - 关闭后焦点归还触发元素。
 */
export function useDialogKeyboard({
  active,
  containerRef,
  onClose,
  closeDisabled = false,
}: DialogKeyboardOptions): void {
  const onCloseRef = useRef(onClose);
  const closeDisabledRef = useRef(closeDisabled);

  useEffect(() => {
    onCloseRef.current = onClose;
    closeDisabledRef.current = closeDisabled;
  }, [onClose, closeDisabled]);

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;
    const dialog: HTMLElement = container;

    const layerId = Symbol("dialog");
    dialogStack.push(layerId);
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const { body } = document;
    const previousOverflow = body.style.overflow;
    const previousPaddingRight = body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }

    const focusInitial = () => {
      const preferred = dialog.querySelector<HTMLElement>("[data-autofocus]");
      const target =
        (preferred && isElementVisible(preferred) ? preferred : null) ??
        getFocusableElements(dialog)[0] ??
        dialog;
      target.focus();
    };
    const frame = window.requestAnimationFrame(focusInitial);

    function onKeyDown(event: KeyboardEvent) {
      if (dialogStack[dialogStack.length - 1] !== layerId) return;

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (!closeDisabledRef.current) onCloseRef.current();
        return;
      }

      if (event.key !== "Tab") return;
      const focusable = getFocusableElements(dialog);
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
      const nextIndex = getFocusTrapIndex(currentIndex, focusable.length, event.shiftKey);
      if (nextIndex >= 0) {
        event.preventDefault();
        focusable[nextIndex].focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown, true);
      const index = dialogStack.indexOf(layerId);
      if (index >= 0) dialogStack.splice(index, 1);

      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPaddingRight;
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [active, containerRef]);
}
