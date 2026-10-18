"use client";

import clsx from "clsx";
import {
  AlertCircle,
  Check,
  Copy,
  LoaderCircle,
  QrCode,
  RefreshCw,
  X,
} from "lucide-react";
import {
  useEffect,
  useRef,
  type MouseEvent,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { useLanguage } from "@/lib/i18n/context";
import {
  formatInviteExpiry,
  formatInviteRemaining,
  getInviteRemainingMs,
  getInviteStatus,
  INVITE_DEFAULT_MINUTES,
  type InviteStatus,
} from "@/lib/invite";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "textarea:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

type DisplayStatus = InviteStatus | "loading" | "error";

export type InviteModalContentProps = {
  roomName: string;
  roomCode: string;
  inviteLink: string;
  expiresAt: string | null;
  qrDataUrl: string | null;
  qrLoading?: boolean;
  loading: boolean;
  error: string | null;
  copied: boolean;
  now: number;
  onCopy: () => void;
  onRegenerate: () => void;
  onClose: () => void;
  panelRef?: RefObject<HTMLElement | null>;
  closeRef?: RefObject<HTMLButtonElement | null>;
};

function getStatusLabel(
  status: DisplayStatus,
  t: ReturnType<typeof useLanguage>["t"],
): string {
  switch (status) {
    case "active":
      return t("invite.status.active");
    case "expiring":
      return t("invite.status.expiring");
    case "expired":
      return t("invite.status.expired");
    case "loading":
      return t("invite.status.loading");
    case "error":
      return t("invite.status.error");
  }
}

/**
 * Pure presentational content, exported separately so SSR tests can render it
 * without a DOM. The interactive shell below owns portal / focus / scroll lock.
 */
export function InviteModalContent({
  roomName,
  roomCode,
  inviteLink,
  expiresAt,
  qrDataUrl,
  qrLoading = false,
  loading,
  error,
  copied,
  now,
  onCopy,
  onRegenerate,
  onClose,
  panelRef,
  closeRef,
}: InviteModalContentProps) {
  const { t, lang } = useLanguage();

  const status: DisplayStatus = loading
    ? "loading"
    : error
      ? "error"
      : getInviteStatus(expiresAt, now);
  const hasLink = Boolean(inviteLink) && !loading && !error;
  const expired = hasLink && status === "expired";
  const remainingMs = getInviteRemainingMs(expiresAt, now);
  const expiresLabel = expiresAt
    ? t("invite.expiresAt", {
        time: formatInviteExpiry(expiresAt, lang, now),
      })
    : "";
  const sideMessage = loading
    ? t("invite.loading")
    : error
      ? error
      : expired
        ? t("invite.expiredHint")
        : expiresLabel;

  return (
    <section
      ref={panelRef}
      className="invite-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="invite-modal-title"
      aria-describedby="invite-modal-description"
      aria-busy={loading || undefined}
      tabIndex={-1}
    >
      <header className="invite-modal__head">
        <div className="invite-modal__heading">
          <p className="invite-modal__eyebrow">
            <span>{t("invite.eyebrow")}</span>
            <span aria-hidden="true">/</span>
            <span className="invite-modal__code">{roomCode}</span>
          </p>
          <h2 id="invite-modal-title" className="invite-modal__title">
            {t("invite.title")}
          </h2>
          <p id="invite-modal-description" className="invite-modal__desc">
            {t("invite.subtitle")}
          </p>
        </div>
        <button
          ref={closeRef}
          type="button"
          className="icon-btn invite-modal__close"
          aria-label={t("invite.close")}
          onClick={onClose}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>

      <div className="invite-pass">
        <div
          className="invite-pass__qr"
          data-expired={expired ? "true" : "false"}
        >
          {loading ? (
            <div className="invite-pass__placeholder" role="status">
              <LoaderCircle
                className="h-5 w-5 animate-spin"
                aria-hidden="true"
              />
              <span>{t("invite.qrLoading")}</span>
            </div>
          ) : error ? (
            <div
              className="invite-pass__placeholder invite-pass__placeholder--error"
              role="alert"
            >
              <AlertCircle className="h-5 w-5" aria-hidden="true" />
              <span>{t("invite.loadFailed")}</span>
            </div>
          ) : qrLoading ? (
            <div className="invite-pass__placeholder" role="status">
              <LoaderCircle
                className="h-5 w-5 animate-spin"
                aria-hidden="true"
              />
              <span>{t("invite.qrLoading")}</span>
            </div>
          ) : qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- data URL QR, not optimizable
            <img
              src={qrDataUrl}
              alt={t("invite.qrAlt", { room: roomName })}
              width={360}
              height={360}
            />
          ) : (
            <div className="invite-pass__placeholder">
              <QrCode className="h-5 w-5" aria-hidden="true" />
              <span>{t("invite.qrFailed")}</span>
            </div>
          )}
          {expired ? (
            <div className="invite-pass__expired" aria-hidden="true">
              <span>{t("invite.status.expired")}</span>
            </div>
          ) : null}
        </div>

        <div className="invite-pass__side">
          <div className="invite-pass__statusline">
            <span className="invite-status" data-state={status}>
              <span className="invite-status__dot" aria-hidden="true" />
              {getStatusLabel(status, t)}
            </span>
            {hasLink && !expired ? (
              <span className="invite-pass__remaining" aria-hidden="true">
                {formatInviteRemaining(remainingMs)}
              </span>
            ) : null}
          </div>

          <p className="invite-pass__expires">{sideMessage}</p>

          <dl className="invite-facts">
            <div className="invite-facts__row">
              <dt>{t("invite.validity.label")}</dt>
              <dd>
                {t("invite.validity.value", {
                  minutes: INVITE_DEFAULT_MINUTES,
                })}
              </dd>
            </div>
            <div className="invite-facts__row">
              <dt>{t("invite.usage.label")}</dt>
              <dd>{t("invite.usage.value")}</dd>
            </div>
          </dl>
          <p className="invite-pass__hint">{t("invite.usage.hint")}</p>
        </div>
      </div>

      <div className="invite-link" aria-busy={loading || undefined}>
        <label className="invite-link__label" htmlFor="invite-link-input">
          {t("invite.linkLabel")}
        </label>
        <div className="invite-link__row">
          <input
            id="invite-link-input"
            className="invite-link__input"
            type="text"
            readOnly
            value={inviteLink}
            placeholder={
              loading
                ? t("invite.loading")
                : error
                  ? t("invite.loadFailed")
                  : ""
            }
            aria-label={t("invite.linkLabel")}
            onFocus={(event) => event.currentTarget.select()}
          />
          <button
            type="button"
            className="btn-primary btn-md invite-link__copy"
            onClick={onCopy}
            disabled={!hasLink || expired}
            data-copied={copied ? "true" : "false"}
            data-autofocus={hasLink && !expired ? "true" : undefined}
          >
            {copied ? (
              <Check className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Copy className="h-4 w-4" aria-hidden="true" />
            )}
            {copied ? t("invite.copied") : t("invite.copy")}
          </button>
        </div>
        <p className="invite-link__feedback" role="status" aria-live="polite">
          {copied ? t("invite.copyFeedback") : ""}
        </p>
      </div>

      <footer className="invite-modal__foot">
        <p className="invite-modal__footnote">{t("invite.footnote")}</p>
        <button
          type="button"
          className="btn-ghost btn-sm invite-modal__regen"
          onClick={onRegenerate}
          disabled={loading}
        >
          <RefreshCw
            className={clsx("h-3.5 w-3.5", loading && "animate-spin")}
            aria-hidden="true"
          />
          {loading
            ? t("invite.regenerating")
            : error
              ? t("invite.retry")
              : t("invite.regenerate")}
        </button>
      </footer>
    </section>
  );
}

export function InviteModal(props: InviteModalContentProps) {
  const panelRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const { onClose } = props;

  // Lock body scroll and move focus into the dialog; restore everything on close.
  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const { body, documentElement } = document;
    const previousOverflow = body.style.overflow;
    const previousPaddingRight = body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - documentElement.clientWidth;

    body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }

    const focusTimer = window.setTimeout(() => {
      const autoFocusTarget = panelRef.current?.querySelector<HTMLElement>(
        '[data-autofocus="true"]:not([disabled])',
      );
      (autoFocusTarget ?? closeRef.current)?.focus();
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPaddingRight;
      previouslyFocused?.focus();
    };
  }, []);

  // Esc closes; Tab cycles inside the dialog without escaping to the page.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const root = panelRef.current;
      if (!root) return;

      const focusable = Array.from(
        root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((element) => element.getClientRects().length > 0);

      if (focusable.length === 0) {
        event.preventDefault();
        root.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      const focusIsOutside = !root.contains(active);

      if (event.shiftKey && (active === first || focusIsOutside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || focusIsOutside)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleOverlayMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  const content = (
    <div className="invite-overlay" onMouseDown={handleOverlayMouseDown}>
      <InviteModalContent
        {...props}
        panelRef={panelRef}
        closeRef={closeRef}
      />
    </div>
  );

  // The dialog only mounts after a user action, but keeping SSR safe makes the
  // presentational component directly testable with renderToStaticMarkup.
  return typeof document === "undefined"
    ? content
    : createPortal(content, document.body);
}
