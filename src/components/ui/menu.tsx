"use client";

import clsx from "clsx";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEventHandler,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import {
  computeMenuPosition,
  type MenuPlacement,
} from "@/lib/menu";

const ITEM_SELECTOR = '[role="menuitem"]:not([disabled])';

type MenuContextValue = {
  close: () => void;
};

const MenuContext = createContext<MenuContextValue | null>(null);

function getEnabledItems(panel: HTMLDivElement | null): HTMLElement[] {
  if (!panel) return [];
  return Array.from(panel.querySelectorAll<HTMLElement>(ITEM_SELECTOR));
}

export function MenuSurface({
  ariaLabel,
  children,
  className,
  panelRef,
  style,
  onKeyDown,
}: {
  ariaLabel: string;
  children: ReactNode;
  className?: string;
  panelRef?: RefObject<HTMLDivElement | null>;
  style?: CSSProperties;
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
}) {
  return (
    <div
      ref={panelRef}
      role="menu"
      aria-label={ariaLabel}
      tabIndex={-1}
      className={clsx("menu-panel menu-panel--floating", className)}
      style={style}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>
  );
}

export function MenuGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const labelId = useId();
  return (
    <div role="group" aria-labelledby={labelId} className="menu-group">
      <p id={labelId} className="menu-group__label">
        {label}
      </p>
      {children}
    </div>
  );
}

export function MenuSeparator() {
  return <div role="separator" className="menu-separator" />;
}

export function MenuItem({
  children,
  icon,
  danger = false,
  disabled = false,
  onSelect,
}: {
  children: ReactNode;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  const menu = useContext(MenuContext);
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      className={clsx("menu-item", danger && "menu-item--danger")}
      onClick={() => {
        onSelect();
        menu?.close();
      }}
    >
      {icon ? (
        <span className="menu-item__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className="menu-item__label">{children}</span>
    </button>
  );
}

export function Menu({
  open,
  onClose,
  anchorRef,
  returnFocusRef,
  ariaLabel,
  align = "end",
  children,
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  returnFocusRef?: RefObject<HTMLElement | null>;
  ariaLabel: string;
  align?: "start" | "end";
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
    placement: MenuPlacement;
  } | null>(null);

  useEffect(() => {
    if (!open) {
      const resetFrame = window.requestAnimationFrame(() => setPosition(null));
      return () => window.cancelAnimationFrame(resetFrame);
    }

    const updatePosition = () => {
      const anchor = anchorRef.current;
      const panel = panelRef.current;
      if (!anchor || !panel) return;
      const anchorRect = anchor.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      setPosition(
        computeMenuPosition(
          {
            top: anchorRect.top,
            left: anchorRect.left,
            width: anchorRect.width,
            height: anchorRect.height,
          },
          { width: panelRect.width, height: panelRect.height },
          { width: window.innerWidth, height: window.innerHeight },
          align,
        ),
      );
    };

    const frame = window.requestAnimationFrame(updatePosition);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", onClose, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [open, anchorRef, align, onClose]);

  useEffect(() => {
    if (!open) return;
    const previous =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusTarget = returnFocusRef?.current ?? previous;
    getEnabledItems(panelRef.current)[0]?.focus();
    return () => {
      focusTarget?.focus();
    };
  }, [open, returnFocusRef]);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    };
    window.addEventListener("mousedown", onMouseDown);
    return () => window.removeEventListener("mousedown", onMouseDown);
  }, [open, anchorRef, onClose]);

  const onKeyDown: KeyboardEventHandler<HTMLDivElement> = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === "Tab") {
      onClose();
      return;
    }

    const items = getEnabledItems(panelRef.current);
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement as HTMLElement);

    if (event.key === "ArrowDown") {
      event.preventDefault();
      items[(current + 1 + items.length) % items.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      items[(current - 1 + items.length) % items.length]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      items[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      items[items.length - 1]?.focus();
    }
  };

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <MenuContext.Provider value={{ close: onClose }}>
      <MenuSurface
        ariaLabel={ariaLabel}
        panelRef={panelRef}
        onKeyDown={onKeyDown}
        className={position?.placement === "top" ? "menu-panel--top" : undefined}
        style={
          position
            ? { top: position.top, left: position.left }
            : { visibility: "hidden" }
        }
      >
        {children}
      </MenuSurface>
    </MenuContext.Provider>,
    document.body,
  );
}
