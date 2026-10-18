"use client";

import { useEffect, useRef, type RefObject } from "react";
import { getMenuFocusIndex } from "@/lib/keyboard";

type MenuKeyboardOptions = {
  active: boolean;
  containerRef: RefObject<HTMLElement | null>;
  onClose: () => void;
};

const MENU_ITEM_SELECTOR = '[role="menuitem"]:not([disabled])';

// 同一时刻只允许最上层菜单响应键盘，避免房间菜单与成员菜单同时打开时互相抢焦点。
const menuStack: symbol[] = [];

/**
 * 菜单键盘契约：打开后聚焦首项；ArrowUp/ArrowDown/Home/End 循环导航；
 * Esc 或 Tab 关闭，关闭后焦点归还触发按钮。
 */
export function useMenuKeyboard({
  active,
  containerRef,
  onClose,
}: MenuKeyboardOptions): void {
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    const layerId = Symbol("menu");
    menuStack.push(layerId);
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const getItems = () =>
      Array.from(container.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR));

    const focusItem = (index: number) => {
      const items = getItems();
      if (items[index]) items[index].focus();
    };
    const frame = window.requestAnimationFrame(() => focusItem(0));

    function onKeyDown(event: KeyboardEvent) {
      if (menuStack[menuStack.length - 1] !== layerId) return;

      if (event.key === "Escape" || event.key === "Tab") {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }

      const items = getItems();
      if (items.length === 0) {
        if (event.key === "Tab") {
          event.preventDefault();
          event.stopPropagation();
          onCloseRef.current();
        }
        return;
      }

      const currentIndex = items.indexOf(document.activeElement as HTMLElement);
      const nextIndex = getMenuFocusIndex(currentIndex, items.length, event.key);
      if (nextIndex === null) return;

      event.preventDefault();
      event.stopPropagation();
      items[nextIndex]?.focus();
    }

    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown, true);
      const index = menuStack.indexOf(layerId);
      if (index >= 0) menuStack.splice(index, 1);
      const activeElement = document.activeElement;
      const focusIsInsideMenu =
        activeElement === document.body || container.contains(activeElement);
      if (previouslyFocused?.isConnected && focusIsInsideMenu) {
        previouslyFocused.focus();
      }
    };
  }, [active, containerRef]);
}
