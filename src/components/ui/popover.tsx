"use client";

import clsx from "clsx";
import { useEffect, useId, useRef, type ReactNode } from "react";
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

// 轻量弹层面板：portal 渲染到 body（规避祖先 overflow 裁剪），
// 半透明背景遮罩 + 居中卡片，点击遮罩或按 Esc 关闭；打开时锁定滚动、
// 聚焦面板并圈定 Tab 焦点，关闭后归还焦点。主题感知（.popover-panel）。
export function Popover({
  open,
  onClose,
  title,
  description,
  children,
  closeLabel = "关闭",
  closeDisabled = false,
  size = "sm",
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  closeLabel?: string;
  closeDisabled?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const sizeClass = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
  }[size];

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
    panel?.focus();

    return () => {
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPaddingRight;
      previous?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
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
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="popover-backdrop fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto px-4 py-[12vh]"
      onMouseDown={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        className={clsx("popover-panel popover-panel--in w-full p-4", sizeClass, className)}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={title && description ? descriptionId : undefined}
        aria-label={title ? undefined : closeLabel}
        tabIndex={-1}
      >
        {title ? (
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 id={titleId} className="text-sm font-semibold text-ink">{title}</h3>
              {description ? (
                <p id={descriptionId} className="mt-1 text-[11px] leading-5 text-ink-faint">
                  {description}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={closeDisabled}
              aria-label={closeLabel}
              className="icon-btn h-7 w-7 shrink-0 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : null}
        {children}
      </div>
    </div>,
    document.body,
  );
}
