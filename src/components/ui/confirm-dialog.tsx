"use client";

import clsx from "clsx";
import { LoaderCircle } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function ConfirmDialogContent({
  title,
  description,
  confirmLabel,
  cancelLabel,
  titleId,
  descriptionId,
  tone = "default",
  busy = false,
  panelRef,
  cancelRef,
  onConfirm,
  onCancel,
}: {
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  titleId: string;
  descriptionId: string;
  tone?: "default" | "danger";
  busy?: boolean;
  panelRef?: RefObject<HTMLElement | null>;
  cancelRef?: RefObject<HTMLButtonElement | null>;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <section
      ref={panelRef}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      className="confirm-panel"
      tabIndex={-1}
    >
      <h2 id={titleId} className="confirm-title">
        {title}
      </h2>
      {description ? (
        <p id={descriptionId} className="confirm-description">
          {description}
        </p>
      ) : null}
      <div className="confirm-actions">
        <button
          ref={cancelRef}
          type="button"
          className="btn-secondary btn-sm"
          onClick={onCancel}
          disabled={busy}
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          className={clsx("btn-sm", tone === "danger" ? "btn-danger" : "btn-primary")}
          onClick={onConfirm}
          disabled={busy}
          aria-busy={busy || undefined}
        >
          {busy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
          {confirmLabel}
        </button>
      </div>
    </section>
  );
}

function trapTabFocus(event: KeyboardEvent, panel: HTMLElement | null) {
  if (event.key !== "Tab" || !panel) return;
  const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  if (focusable.length === 0) {
    event.preventDefault();
    panel.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone = "default",
  busy = false,
  onConfirm,
  onCancel,
  returnFocusRef,
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  tone?: "default" | "danger";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const previous =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusTarget = returnFocusRef?.current ?? previous;
    const { body } = document;
    const previousOverflow = body.style.overflow;
    const previousPaddingRight = body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    body.style.overflow = "hidden";
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;
    cancelRef.current?.focus();

    return () => {
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPaddingRight;
      focusTarget?.focus();
    };
  }, [open, returnFocusRef]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!busy) onCancel();
        return;
      }
      trapTabFocus(event, panelRef.current);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, busy, onCancel]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="confirm-backdrop fixed inset-0 z-[95] flex items-center justify-center p-4"
      onMouseDown={() => {
        if (!busy) onCancel();
      }}
      role="presentation"
    >
      <div onMouseDown={(event) => event.stopPropagation()}>
        <ConfirmDialogContent
          title={title}
          description={description}
          confirmLabel={confirmLabel}
          cancelLabel={cancelLabel}
          titleId={titleId}
          descriptionId={descriptionId}
          tone={tone}
          busy={busy}
          panelRef={panelRef}
          cancelRef={cancelRef}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      </div>
    </div>,
    document.body,
  );
}
