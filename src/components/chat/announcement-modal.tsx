"use client";

/* eslint-disable @next/next/no-img-element */

import {
  useEffect,
  useId,
  useRef,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { Check, LoaderCircle, Maximize2, Megaphone, X } from "lucide-react";
import { formatAnnouncementUpdatedAt, splitAnnouncementParagraphs } from "@/lib/announcement-reader";
import { useLanguage, useT } from "@/lib/i18n/context";

export type AnnouncementModalImage = {
  imageUrl: string;
  imageName: string | null;
};

export type AnnouncementModalContentProps = {
  text: string | null;
  images: AnnouncementModalImage[];
  updatedAt: string | null;
  unread: boolean;
  preview: boolean;
  pending: boolean;
  onClose: () => void;
  onOpenImage: (url: string, fileName: string) => void;
  panelRef?: RefObject<HTMLDivElement | null>;
  titleId?: string;
  hintId?: string;
};

export type AnnouncementModalProps = AnnouncementModalContentProps & {
  open: boolean;
  /** Temporarily disable the focus trap and Esc handling while a nested viewer is open. */
  paused?: boolean;
};

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function AnnouncementModalContent({
  text,
  images,
  updatedAt,
  unread,
  preview,
  pending,
  onClose,
  onOpenImage,
  panelRef,
  titleId: providedTitleId,
  hintId: providedHintId,
}: AnnouncementModalContentProps) {
  const t = useT();
  const { lang } = useLanguage();
  const autoTitleId = useId();
  const autoHintId = useId();
  const titleId = providedTitleId ?? autoTitleId;
  const hintId = providedHintId ?? autoHintId;
  const paragraphs = splitAnnouncementParagraphs(text);
  const updatedLabel = formatAnnouncementUpdatedAt(updatedAt, lang);
  const showUnread = unread && !preview;

  const hint = preview
    ? t("announcement.reader.previewHint")
    : showUnread
      ? t("announcement.reader.unreadHint")
      : t("announcement.reader.readHint");

  return (
    <section
      ref={panelRef}
      className="announcement-modal__panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={hintId}
      tabIndex={-1}
    >
      <header className="announcement-modal__header">
        <span className="announcement-modal__mark" aria-hidden="true">
          <Megaphone className="h-5 w-5" />
        </span>
        <div className="announcement-modal__heading">
          <div className="announcement-modal__title-row">
            <h2 id={titleId} className="announcement-modal__title">
              {preview
                ? t("announcement.reader.previewTitle")
                : t("announcement.reader.title")}
            </h2>
            {showUnread ? (
              <span className="announcement-modal__badge">
                <span className="announcement-modal__badge-dot" aria-hidden="true" />
                {t("announcement.reader.unread")}
              </span>
            ) : null}
          </div>
          {updatedLabel ? (
            <p className="announcement-modal__meta">
              {t("announcement.reader.updatedAt", { time: updatedLabel })}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          className="icon-btn announcement-modal__close"
          onClick={onClose}
          disabled={pending}
          aria-label={t("common.close")}
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="announcement-modal__body">
        <article className="announcement-modal__article">
          {paragraphs.length > 0 ? (
            <div className="announcement-modal__text">
              {paragraphs.map((paragraph, index) => (
                <p key={`paragraph-${index}`} className="announcement-modal__paragraph">
                  {paragraph}
                </p>
              ))}
            </div>
          ) : null}

          {images.length > 0 ? (
            <div className="announcement-modal__images" data-count={images.length}>
              <p className="announcement-modal__image-count">
                {images.length === 1
                  ? t("announcement.reader.imageCount.one")
                  : t("announcement.reader.imageCount", { count: images.length })}
              </p>
              {images.map((image, index) => (
                <button
                  key={`${image.imageUrl}-${index}`}
                  type="button"
                  className="announcement-modal__image"
                  onClick={() =>
                    onOpenImage(
                      image.imageUrl,
                      image.imageName ?? `announcement-${index + 1}`,
                    )
                  }
                  aria-label={t("announcement.reader.openImage", { index: index + 1 })}
                >
                  <img
                    src={image.imageUrl}
                    alt={image.imageName ?? t("announcement.reader.imageAlt", { index: index + 1 })}
                    loading="lazy"
                  />
                  <span className="announcement-modal__image-hint" aria-hidden="true">
                    <Maximize2 className="h-3.5 w-3.5" />
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </article>
      </div>

      <footer className="announcement-modal__footer">
        <p id={hintId} className="announcement-modal__hint">
          {hint}
        </p>
        <button
          type="button"
          className="btn-primary btn-md announcement-modal__action"
          onClick={onClose}
          disabled={pending}
          aria-busy={pending || undefined}
          data-autofocus="true"
        >
          {pending ? (
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : showUnread ? (
            <Check className="h-4 w-4" aria-hidden="true" />
          ) : null}
          {pending
            ? t("announcement.reader.acknowledging")
            : preview
              ? t("announcement.reader.closePreview")
              : showUnread
                ? t("announcement.reader.acknowledge")
                : t("common.close")}
        </button>
      </footer>
    </section>
  );
}

export function AnnouncementModal({
  open,
  paused = false,
  ...contentProps
}: AnnouncementModalProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const { onClose } = contentProps;

  useEffect(() => {
    if (!open) return;

    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusTimer = window.setTimeout(() => {
      panelRef.current
        ?.querySelector<HTMLElement>("[data-autofocus]")
        ?.focus();
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      restoreFocusRef.current?.focus();
      restoreFocusRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (!open || paused) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;

      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((element) => element.offsetParent !== null);

      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, paused, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="announcement-modal">
      <div
        className="announcement-modal__backdrop"
        aria-hidden="true"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      />
      <AnnouncementModalContent {...contentProps} panelRef={panelRef} />
    </div>,
    document.body,
  );
}
