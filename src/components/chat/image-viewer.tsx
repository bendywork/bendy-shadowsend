"use client";

/* eslint-disable @next/next/no-img-element */
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  LoaderCircle,
  Minus,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import { resolveErrorMessage } from "@/lib/feedback";
import { useT } from "@/lib/i18n/context";
import {
  IMAGE_VIEWER_ZOOM_STEP,
  clampImageIndex,
  clampPanOffset,
  clampZoom,
  getImageViewerAction,
  getPanLimit,
  getZoomPercent,
  stepImageIndex,
  stepZoom,
  type ImageViewerItem,
} from "@/lib/image-viewer";

export type ImageViewerProps = {
  items: ImageViewerItem[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  onError?: (message: string) => void;
};

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

function triggerAnchorDownload(src: string, fileName: string) {
  const link = document.createElement("a");
  link.href = src;
  link.download = fileName;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/**
 * Full-screen image viewer for chat attachments and announcement images.
 *
 * Interactions: prev/next (buttons, thumbnails, ←/→), zoom (buttons, wheel,
 * double-click, +/-), pan by dragging while zoomed, download, Esc/backdrop close.
 */
export function ImageViewer({
  items,
  index,
  onIndexChange,
  onClose,
  onError,
}: ImageViewerProps) {
  const t = useT();
  const [mounted, setMounted] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const activeIndex = clampImageIndex(index, items.length);
  const current = items[activeIndex] ?? null;
  const hasMultiple = items.length > 1;
  const zoomPercent = getZoomPercent(zoom);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setLoading(true);
    setFailed(false);
    setReloadToken(0);
    setDownloadError(null);
  }, [activeIndex, current?.src]);

  useEffect(() => {
    if (zoom <= 1) setOffset({ x: 0, y: 0 });
  }, [zoom]);

  useEffect(() => {
    if (!mounted) return;
    const previousOverflow = document.body.style.overflow;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => closeRef.current?.focus(), 0);

    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      const action = getImageViewerAction(event.key, hasMultiple);
      if (!action) return;
      event.preventDefault();

      switch (action) {
        case "close":
          onClose();
          break;
        case "previous":
          onIndexChange(stepImageIndex(activeIndex, items.length, -1));
          break;
        case "next":
          onIndexChange(stepImageIndex(activeIndex, items.length, 1));
          break;
        case "first":
          onIndexChange(0);
          break;
        case "last":
          onIndexChange(items.length - 1);
          break;
        case "zoom-in":
          setZoom((prev) => stepZoom(prev, IMAGE_VIEWER_ZOOM_STEP));
          break;
        case "zoom-out":
          setZoom((prev) => stepZoom(prev, -IMAGE_VIEWER_ZOOM_STEP));
          break;
        case "reset":
          setZoom(1);
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mounted, hasMultiple, activeIndex, items.length, onClose, onIndexChange]);

  useEffect(() => {
    if (!mounted) return;
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const direction = event.deltaY < 0 ? 1 : -1;
      setZoom((prev) => stepZoom(prev, direction * IMAGE_VIEWER_ZOOM_STEP));
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [mounted]);

  function changeIndex(nextIndex: number) {
    onIndexChange(clampImageIndex(nextIndex, items.length));
  }

  function applyZoom(nextZoom: number) {
    setZoom(clampZoom(nextZoom));
  }

  async function handleDownload() {
    if (!current || downloading) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      if (current.onDownload) {
        await current.onDownload();
      } else {
        triggerAnchorDownload(current.src, current.fileName);
      }
    } catch (error) {
      const message = resolveErrorMessage(error, t("imageViewer.downloadFailed"), t);
      setDownloadError(message);
      onError?.(message);
    } finally {
      setDownloading(false);
    }
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (zoom <= 1 || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y,
    };
    setDragging(true);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const stage = stageRef.current;
    const limitX = stage ? getPanLimit(stage.clientWidth, zoom) : 0;
    const limitY = stage ? getPanLimit(stage.clientHeight, zoom) : 0;
    setOffset({
      x: clampPanOffset(drag.originX + event.clientX - drag.startX, limitX),
      y: clampPanOffset(drag.originY + event.clientY - drag.startY, limitY),
    });
  }

  function handlePointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleDoubleClick() {
    setZoom((prev) => (prev > 1 ? 1 : 2));
  }

  function handleDialogKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") return;
    const nodes = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    if (!nodes || nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (!dialogRef.current?.contains(document.activeElement)) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  if (!mounted || !current) return null;

  return createPortal(
    <div
      className="image-viewer"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("imageViewer.label")}
        className="image-viewer__dialog"
        onKeyDown={handleDialogKeyDown}
      >
        <header className="image-viewer__topbar">
          <div className="image-viewer__identity">
            <p className="image-viewer__filename" title={current.fileName}>
              {current.fileName}
            </p>
            <p className="image-viewer__meta">
              <span>{t("imageViewer.counter", { current: activeIndex + 1, total: items.length })}</span>
              <span aria-hidden="true">·</span>
              <span>{t("imageViewer.zoom", { percent: zoomPercent })}</span>
            </p>
          </div>

          <div className="image-viewer__actions">
            <Tooltip label={t("imageViewer.zoomOut")}>
              <button
                type="button"
                className="image-viewer__control"
                onClick={() => applyZoom(stepZoom(zoom, -IMAGE_VIEWER_ZOOM_STEP))}
                disabled={zoom <= 1}
                aria-label={t("imageViewer.zoomOut")}
              >
                <Minus aria-hidden="true" />
              </button>
            </Tooltip>
            <Tooltip label={t("imageViewer.zoomIn")}>
              <button
                type="button"
                className="image-viewer__control"
                onClick={() => applyZoom(stepZoom(zoom, IMAGE_VIEWER_ZOOM_STEP))}
                disabled={zoom >= 4}
                aria-label={t("imageViewer.zoomIn")}
              >
                <Plus aria-hidden="true" />
              </button>
            </Tooltip>
            <Tooltip label={t("imageViewer.resetZoom")}>
              <button
                type="button"
                className="image-viewer__control"
                onClick={() => applyZoom(1)}
                aria-label={t("imageViewer.resetZoom")}
              >
                <RotateCcw aria-hidden="true" />
              </button>
            </Tooltip>
            <Tooltip label={t("imageViewer.download")}>
              <button
                type="button"
                className="image-viewer__control"
                onClick={() => void handleDownload()}
                disabled={downloading}
                aria-label={t("imageViewer.download")}
              >
                {downloading ? (
                  <LoaderCircle className="image-viewer__spinner" aria-hidden="true" />
                ) : (
                  <Download aria-hidden="true" />
                )}
              </button>
            </Tooltip>
            <button
              ref={closeRef}
              type="button"
              className="image-viewer__control image-viewer__control--close"
              onClick={onClose}
              aria-label={t("common.close")}
            >
              <X aria-hidden="true" />
            </button>
          </div>
        </header>

        {downloadError ? (
          <p className="image-viewer__error" role="alert">
            {downloadError}
          </p>
        ) : null}

        <div
          ref={stageRef}
          className={clsx(
            "image-viewer__stage",
            zoom > 1 && "image-viewer__stage--zoomed",
            dragging && "image-viewer__stage--dragging",
          )}
          onClick={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
          onDoubleClick={handleDoubleClick}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
        >
          {loading && !failed ? (
            <div
              className="image-viewer__status"
              role="status"
              aria-label={t("imageViewer.loading")}
            >
              <LoaderCircle className="image-viewer__spinner" aria-hidden="true" />
            </div>
          ) : null}

          {failed ? (
            <div className="image-viewer__status" role="alert">
              <p>{t("imageViewer.loadFailed")}</p>
              <button
                type="button"
                className="image-viewer__retry"
                onClick={() => {
                  setFailed(false);
                  setLoading(true);
                  setReloadToken((value) => value + 1);
                }}
              >
                {t("common.retry")}
              </button>
            </div>
          ) : (
            <img
              key={`${current.src}-${reloadToken}`}
              src={current.src}
              alt={t("attachment.imageAlt", { name: current.fileName })}
              className="image-viewer__image"
              style={{
                transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${zoom})`,
              }}
              draggable={false}
              onLoad={() => setLoading(false)}
              onError={() => {
                setLoading(false);
                setFailed(true);
              }}
            />
          )}

          {hasMultiple ? (
            <>
              <button
                type="button"
                className="image-viewer__nav image-viewer__nav--prev"
                onClick={(event) => {
                  event.stopPropagation();
                  changeIndex(stepImageIndex(activeIndex, items.length, -1));
                }}
                aria-label={t("imageViewer.previous")}
              >
                <ChevronLeft aria-hidden="true" />
              </button>
              <button
                type="button"
                className="image-viewer__nav image-viewer__nav--next"
                onClick={(event) => {
                  event.stopPropagation();
                  changeIndex(stepImageIndex(activeIndex, items.length, 1));
                }}
                aria-label={t("imageViewer.next")}
              >
                <ChevronRight aria-hidden="true" />
              </button>
            </>
          ) : null}
        </div>

        {hasMultiple ? (
          <div
            className="image-viewer__thumbs"
            role="tablist"
            aria-label={t("imageViewer.thumbnails")}
          >
            {items.map((item, itemIndex) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={itemIndex === activeIndex}
                aria-label={t("imageViewer.thumbnail", {
                  index: itemIndex + 1,
                  name: item.fileName,
                })}
                className={clsx(
                  "image-viewer__thumb",
                  itemIndex === activeIndex && "image-viewer__thumb--active",
                )}
                onClick={() => changeIndex(itemIndex)}
              >
                <img src={item.src} alt="" loading="lazy" />
              </button>
            ))}
          </div>
        ) : null}

        <footer className="image-viewer__footer">
          <p className="image-viewer__hint">{t("imageViewer.hint")}</p>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
