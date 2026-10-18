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

const DRAWER_WIDTH = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-2xl",
} as const;

export type PopoverSize = keyof typeof DRAWER_WIDTH;

// 轻量弹层面板：portal 渲染到 body（规避祖先 overflow 裁剪），
// 半透明背景遮罩 + 居中卡片；variant="drawer" 时改为贴边抽屉，
// 适合设置、编辑等需要保留页面上下文的较长表单。
// 点击遮罩或按 Esc 关闭；打开时锁定滚动、聚焦面板并圈定 Tab 焦点，
// 关闭后归还焦点。主题感知（.popover-panel）。
export function Popover({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  closeLabel = "关闭",
  className,
  bodyClassName,
  variant = "dialog",
  side = "right",
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  closeLabel?: string;
  className?: string;
  bodyClassName?: string;
  variant?: "dialog" | "drawer";
  side?: "right" | "left";
  size?: PopoverSize;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const isDrawer = variant === "drawer";

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

  const titleBlock = title || description ? (
    <div className="min-w-0">
      {title ? (
        <h3
          id={titleId}
          className={clsx(
            "text-ink",
            isDrawer ? "text-base font-semibold leading-6" : "text-sm font-semibold",
          )}
        >
          {title}
        </h3>
      ) : null}
      {description ? (
        <p id={descriptionId} className="mt-1 text-xs leading-5 text-ink-muted">
          {description}
        </p>
      ) : null}
    </div>
  ) : null;

  const closeButton = (
    <button
      type="button"
      onClick={onClose}
      aria-label={closeLabel}
      className={clsx("icon-btn shrink-0", isDrawer ? "h-8 w-8" : "h-7 w-7")}
    >
      <X className="h-4 w-4" />
    </button>
  );

  return createPortal(
    <div
      className={clsx(
        "popover-backdrop fixed inset-0 z-[80]",
        isDrawer
          ? "flex justify-end"
          : "flex items-start justify-center overflow-y-auto px-4 py-[12vh]",
      )}
      onMouseDown={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        className={clsx(
          "popover-panel popover-panel--in w-full",
          isDrawer
            ? clsx(
                "popover-panel--drawer flex h-full flex-col",
                DRAWER_WIDTH[size],
                side === "left" && "popover-panel--drawer--left",
              )
            : "max-w-sm p-4",
          className,
        )}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
        aria-label={title ? undefined : closeLabel}
        tabIndex={-1}
      >
        {isDrawer ? (
          <>
            {titleBlock || description ? (
              <div className="flex items-start justify-between gap-4 border-b border-line-subtle px-5 py-4">
                {titleBlock}
                {closeButton}
              </div>
            ) : null}
            <div
              className={clsx("min-h-0 flex-1 overflow-y-auto px-5 py-4", bodyClassName)}
            >
              {children}
            </div>
            {footer ? (
              <div className="border-t border-line-subtle px-5 py-4">{footer}</div>
            ) : null}
          </>
        ) : (
          <>
            {titleBlock ? (
              <div className="mb-3 flex items-start justify-between gap-3">
                {titleBlock}
                {closeButton}
              </div>
            ) : null}
            {children}
            {footer ? <div className="mt-4">{footer}</div> : null}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
