"use client";

import clsx from "clsx";
import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { LoaderCircle, TriangleAlert } from "lucide-react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export type ConfirmDialogTone = "danger" | "default";

export type ConfirmDialogContentProps = {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  pendingLabel?: string;
  pending?: boolean;
  eyebrow?: string;
  tone?: ConfirmDialogTone;
  icon?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
  cancelButtonRef?: RefObject<HTMLButtonElement | null>;
};

export type ConfirmDialogProps = Omit<ConfirmDialogContentProps, "cancelButtonRef"> & {
  open: boolean;
};

/**
 * 纯展示层：可直接服务端渲染，便于不依赖 DOM 的单元测试。
 * 危险操作使用 role="alertdialog"，默认焦点落在「取消」上，避免误触。
 */
export function ConfirmDialogContent({
  title,
  description,
  confirmLabel,
  cancelLabel,
  pendingLabel,
  pending = false,
  eyebrow,
  tone = "danger",
  icon,
  onConfirm,
  onCancel,
  cancelButtonRef,
}: ConfirmDialogContentProps) {
  const titleId = useId();
  const descriptionId = useId();

  return (
    <div
      className={clsx("confirm-dialog__panel", `confirm-dialog__panel--${tone}`)}
      role={tone === "danger" ? "alertdialog" : "dialog"}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-busy={pending || undefined}
      tabIndex={-1}
    >
      <div className="confirm-dialog__header">
        <span className="confirm-dialog__mark" aria-hidden="true">
          {icon ?? <TriangleAlert className="confirm-dialog__mark-icon" />}
        </span>
        <div className="confirm-dialog__copy">
          {eyebrow ? <p className="confirm-dialog__eyebrow">{eyebrow}</p> : null}
          <h2 id={titleId} className="confirm-dialog__title">
            {title}
          </h2>
          <p id={descriptionId} className="confirm-dialog__description">
            {description}
          </p>
        </div>
      </div>

      <div className="confirm-dialog__actions">
        <button
          ref={cancelButtonRef}
          type="button"
          className="btn-secondary confirm-dialog__button"
          onClick={onCancel}
          disabled={pending}
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          className={clsx(
            "confirm-dialog__button",
            tone === "danger" ? "btn-danger" : "btn-primary",
          )}
          onClick={onConfirm}
          disabled={pending}
          aria-busy={pending || undefined}
        >
          {pending ? (
            <LoaderCircle
              className="confirm-dialog__spinner"
              aria-hidden="true"
            />
          ) : null}
          {pending ? (pendingLabel ?? confirmLabel) : confirmLabel}
        </button>
      </div>
    </div>
  );
}

/**
 * 交互外壳：Portal、滚动锁定、Esc / 遮罩关闭、焦点圈定与归还。
 * 提交中（pending）禁止一切关闭路径，避免重复请求或半途状态。
 */
export function ConfirmDialog({
  open,
  pending = false,
  onCancel,
  ...contentProps
}: ConfirmDialogProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const previous =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const { body } = document;
    const previousOverflow = body.style.overflow;
    const previousPaddingRight = body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    body.style.overflow = "hidden";
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;
    cancelButtonRef.current?.focus();

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
        if (!pending) onCancel();
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
  }, [open, pending, onCancel]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="confirm-dialog__backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) onCancel();
      }}
    >
      <div
        ref={panelRef}
        className="confirm-dialog__frame"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <ConfirmDialogContent
          {...contentProps}
          pending={pending}
          onCancel={onCancel}
          cancelButtonRef={cancelButtonRef}
        />
      </div>
    </div>,
    document.body,
  );
}
