"use client";

import clsx from "clsx";
import { X } from "lucide-react";
import {
  useId,
  useRef,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { useT } from "@/lib/i18n/context";
import { useBodyScrollLock } from "./use-body-scroll-lock";
import { useFocusTrap } from "./use-focus-trap";
import { useOverlayLayer } from "./overlay-stack";

const subscribeNoop = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

function useIsClient() {
  return useSyncExternalStore(subscribeNoop, getClientSnapshot, getServerSnapshot);
}

export type OverlayKind = "modal" | "drawer" | "sheet";
export type OverlaySide = "right" | "left" | "bottom";
export type OverlaySize = "sm" | "md" | "lg" | "xl" | "full";
export type OverlayTone = "default" | "media";
export type OverlayAlign = "center" | "top";

export type OverlaySurfaceProps = {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  size?: OverlaySize;
  tone?: OverlayTone;
  closeLabel?: string;
  closeOnOverlayClick?: boolean;
  closeOnEsc?: boolean;
  showClose?: boolean;
  className?: string;
  panelClassName?: string;
  bodyClassName?: string;
  ariaLabel?: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
};

type OverlaySurfaceInternalProps = OverlaySurfaceProps & {
  kind: OverlayKind;
  side: OverlaySide;
  align: OverlayAlign;
};

const MODAL_WIDTH: Record<OverlaySize, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-2xl",
  full: "max-w-5xl",
};

const DRAWER_WIDTH: Record<OverlaySize, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-2xl",
  full: "max-w-full",
};

function getRootClassName(kind: OverlayKind, side: OverlaySide, align: OverlayAlign) {
  if (kind === "modal") {
    return align === "top"
      ? "flex items-start justify-center px-4 pb-4 pt-[12vh]"
      : "flex items-center justify-center p-4";
  }
  if (kind === "sheet") return "flex items-end justify-center";
  return side === "left" ? "flex justify-start" : "flex justify-end";
}

function getPanelClassName(
  kind: OverlayKind,
  side: OverlaySide,
  size: OverlaySize,
  panelClassName?: string,
) {
  const base =
    "relative flex w-full flex-col border-line bg-panel shadow-lg outline-none";

  if (kind === "modal") {
    return clsx(
      base,
      "max-h-[calc(100dvh-2rem)] rounded-2xl border",
      MODAL_WIDTH[size],
      panelClassName,
    );
  }

  if (kind === "sheet") {
    return clsx(
      base,
      "max-h-[85dvh] rounded-t-2xl border-x border-t",
      panelClassName,
    );
  }

  return clsx(
    base,
    "h-full border-y-0",
    side === "left" ? "border-r" : "border-l",
    DRAWER_WIDTH[size],
    panelClassName,
  );
}

function OverlayHeader({
  title,
  description,
  titleId,
  descriptionId,
  closeLabel,
  showClose,
  onClose,
}: {
  title?: ReactNode;
  description?: ReactNode;
  titleId: string;
  descriptionId: string;
  closeLabel: string;
  showClose: boolean;
  onClose: () => void;
}) {
  if (!title && !description && !showClose) return null;

  return (
    <div
      data-overlay-header
      className="flex items-start justify-between gap-4 border-b border-line-subtle px-5 py-4"
    >
      <div className="min-w-0">
        {title ? (
          <h2 id={titleId} className="text-base font-semibold leading-6 text-ink">
            {title}
          </h2>
        ) : null}
        {description ? (
          <p id={descriptionId} className="mt-1 text-xs leading-5 text-ink-muted">
            {description}
          </p>
        ) : null}
      </div>
      {showClose ? (
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          className="icon-btn h-8 w-8 shrink-0"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}

export function OverlaySurface({
  open,
  onClose,
  title,
  description,
  footer,
  children,
  size = "md",
  tone = "default",
  closeLabel,
  closeOnOverlayClick = true,
  closeOnEsc = true,
  showClose = true,
  className,
  panelClassName,
  bodyClassName,
  ariaLabel,
  initialFocusRef,
  kind,
  side,
  align,
}: OverlaySurfaceInternalProps) {
  const t = useT();
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const isClient = useIsClient();
  const { zIndex, isTop } = useOverlayLayer(open);

  useBodyScrollLock(open);
  useFocusTrap({
    open,
    active: isTop,
    panelRef,
    initialFocusRef,
    closeOnEsc,
    onClose,
  });

  if (!isClient || !open) return null;

  const resolvedCloseLabel = closeLabel ?? t("common.close");

  return createPortal(
    <div
      data-overlay-root
      className={clsx("fixed inset-0", getRootClassName(kind, side, align), className)}
      style={{ zIndex }}
    >
      <div
        data-overlay-backdrop
        aria-hidden="true"
        className="absolute inset-0 bg-overlay-strong backdrop-blur-sm"
        onMouseDown={(event) => {
          if (!closeOnOverlayClick) return;
          if (event.target === event.currentTarget) onClose();
        }}
      />
      <div
        ref={panelRef}
        data-overlay-panel
        data-kind={kind}
        data-side={side}
        data-tone={tone}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
        aria-label={!title ? ariaLabel : undefined}
        tabIndex={-1}
        className={getPanelClassName(kind, side, size, panelClassName)}
      >
        <OverlayHeader
          title={title}
          description={description}
          titleId={titleId}
          descriptionId={descriptionId}
          closeLabel={resolvedCloseLabel}
          showClose={showClose}
          onClose={onClose}
        />
        <div
          data-overlay-body
          className={clsx(
            "min-h-0 flex-1 overflow-y-auto px-5 py-4",
            bodyClassName,
          )}
        >
          {children}
        </div>
        {footer ? (
          <div
            data-overlay-footer
            className="flex flex-wrap items-center justify-end gap-2 border-t border-line-subtle px-5 py-4"
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
