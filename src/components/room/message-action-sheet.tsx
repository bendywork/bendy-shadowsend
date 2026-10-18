"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Copy, Download, Image as ImageIcon, X } from "lucide-react";
import { useT } from "@/lib/i18n/context";
import type { AttachmentItem } from "@/types/chat";

export type MessageActionAttachment = {
  id: string;
  fileName: string;
  previewType: AttachmentItem["previewType"];
  previewUrl?: string | null;
  /** Pending uploads have no server-side attachment id yet. */
  downloadable: boolean;
};

export type MessageActionState = {
  messageId: string;
  content: string;
  attachments: MessageActionAttachment[];
};

type MessageActionSheetProps = {
  state: MessageActionState;
  onClose: () => void;
  onCopy: () => void;
  onOpenImage: (url: string | null | undefined, fileName: string) => void;
  onDownload: (attachmentId: string) => void;
};

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

const OPEN_GUARD_MS = 350;

function SheetAction({
  icon,
  label,
  hint,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="sheet-action" onClick={onClick}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-elevated text-ink-soft">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ink">{label}</span>
        {hint ? (
          <span className="mt-0.5 block truncate text-xs text-ink-muted">
            {hint}
          </span>
        ) : null}
      </span>
    </button>
  );
}

/**
 * Bottom action sheet shown after a long press on a message.
 * Rendered through a portal so the room's scroll containers cannot clip it.
 */
export function MessageActionSheet({
  state,
  onClose,
  onCopy,
  onOpenImage,
  onDownload,
}: MessageActionSheetProps) {
  const t = useT();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  const openedAtRef = useRef(0);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    openedAtRef.current = Date.now();
    const panel = panelRef.current;
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const { body } = document;
    const previousOverflow = body.style.overflow;
    body.style.overflow = "hidden";
    panel?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;

      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      if (focusable.length === 0) {
        event.preventDefault();
        panelRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (document.activeElement === panelRef.current) {
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
    return () => {
      body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      previous?.focus();
    };
  }, []);

  if (typeof document === "undefined") return null;

  const imageAttachments = state.attachments.filter(
    (attachment) =>
      attachment.previewType === "IMAGE" && attachment.previewUrl,
  );
  const downloadAttachments = state.attachments.filter(
    (attachment) => attachment.downloadable,
  );

  function handleBackdropClick() {
    // Ignore the synthetic click that can trail the long-press release.
    if (Date.now() - openedAtRef.current < OPEN_GUARD_MS) return;
    onClose();
  }

  return createPortal(
    <div
      className="action-sheet-backdrop fixed inset-0 z-[85] bg-overlay-strong"
      role="presentation"
      onClick={handleBackdropClick}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("messageAction.title")}
        tabIndex={-1}
        className="action-sheet-panel fixed inset-x-0 bottom-0 z-[86] max-h-[85dvh] overflow-y-auto rounded-t-2xl border-t border-line-strong bg-canvas p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[var(--ds-shadow-lg)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className="mx-auto mb-3 h-1 w-10 rounded-full bg-line-strong"
          aria-hidden="true"
        />
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-ink">
              {t("messageAction.title")}
            </h2>
            {state.content ? (
              <p className="mt-1 line-clamp-2 break-words text-xs leading-5 text-ink-muted">
                {state.content}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="icon-btn touch-target shrink-0"
            aria-label={t("common.close")}
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-1">
          {state.content ? (
            <SheetAction
              icon={<Copy className="h-4 w-4" />}
              label={t("messageAction.copy")}
              onClick={() => {
                onCopy();
                onClose();
              }}
            />
          ) : null}

          {imageAttachments.map((attachment) => (
            <SheetAction
              key={`open-${attachment.id}`}
              icon={<ImageIcon className="h-4 w-4" />}
              label={t("messageAction.openImage")}
              hint={attachment.fileName}
              onClick={() => {
                onOpenImage(attachment.previewUrl, attachment.fileName);
                onClose();
              }}
            />
          ))}

          {downloadAttachments.map((attachment) => (
            <SheetAction
              key={`download-${attachment.id}`}
              icon={<Download className="h-4 w-4" />}
              label={t("messageAction.download")}
              hint={attachment.fileName}
              onClick={() => {
                onDownload(attachment.id);
                onClose();
              }}
            />
          ))}
        </div>

        <button
          type="button"
          className="sheet-action mt-3 justify-center border border-line text-sm font-medium"
          onClick={onClose}
        >
          {t("messageAction.cancel")}
        </button>
      </div>
    </div>,
    document.body,
  );
}
