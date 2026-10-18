"use client";

import clsx from "clsx";
import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

type DrawerProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  closeLabel: string;
  closeDisabled?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  className?: string;
  bodyClassName?: string;
};

// 右侧抽屉：portal 渲染到 body，遮罩 + 滑入面板；打开时锁定页面滚动、
// 圈定 Tab 焦点，Esc / 遮罩关闭后归还焦点。动画只使用 transform / opacity。
export function Drawer({
  open,
  onClose,
  title,
  eyebrow,
  description,
  children,
  footer,
  closeLabel,
  closeDisabled = false,
  initialFocusRef,
  className,
  bodyClassName,
}: DrawerProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const previous =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const { body } = document;
    const previousOverflow = body.style.overflow;
    const previousPaddingRight = body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    body.style.overflow = "hidden";
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;

    const preferred = initialFocusRef?.current;
    const firstFocusable = panel?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    (preferred ?? firstFocusable ?? panel)?.focus();

    return () => {
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPaddingRight;
      previous?.focus();
    };
  }, [open, initialFocusRef]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!closeDisabled) onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;

      const panel = panelRef.current;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (document.activeElement === panel) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, closeDisabled]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="drawer-layer" role="presentation">
      <div
        className="drawer-backdrop"
        onMouseDown={() => {
          if (!closeDisabled) onClose();
        }}
      />
      <section
        ref={panelRef}
        className={clsx("drawer-panel", className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
      >
        <header className="drawer-header">
          <div className="drawer-heading">
            {eyebrow ? <p className="drawer-eyebrow">{eyebrow}</p> : null}
            <h2 id={titleId} className="drawer-title">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="drawer-description">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={closeDisabled}
            aria-label={closeLabel}
            className="drawer-close"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>
        <div className={clsx("drawer-body", bodyClassName)}>{children}</div>
        {footer ? <footer className="drawer-footer">{footer}</footer> : null}
      </section>
    </div>,
    document.body,
  );
}
