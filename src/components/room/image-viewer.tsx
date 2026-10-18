"use client";

/* eslint-disable @next/next/no-img-element */
import clsx from "clsx";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Minus,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type TouchEvent as ReactTouchEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  clampPanOffset,
  clampScale,
  distanceBetweenPoints,
  isDoubleTap,
  midpointOfPoints,
  resolveImageSwipe,
  scaleFromPinch,
  type Point,
  type Size,
} from "@/lib/touch-gestures";
import { useT } from "@/lib/i18n/context";

export type ViewerImage = {
  id: string;
  url: string;
  fileName: string;
  /** Present when the image maps to a server-side attachment. */
  attachmentId?: string;
};

type ImageViewerProps = {
  images: ViewerImage[];
  initialIndex: number;
  onClose: () => void;
  onDownload?: (image: ViewerImage) => void;
};

type GestureMode = "pinch" | "pan" | "swipe";

type GestureState = {
  mode: GestureMode;
  startX: number;
  startY: number;
  startedAt: number;
  startScale: number;
  startOffset: Point;
  startDistance: number;
  startMidpoint: Point;
  fromPinch?: boolean;
};

const TAP_MAX_MOVEMENT_PX = 8;
const TAP_MAX_DURATION_MS = 260;
const DOUBLE_TAP_ZOOM = 2.5;
const ZOOM_STEP = 0.5;
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

/**
 * Full-screen image viewer with pinch zoom (1×–4×), panning, double-tap
 * zoom and one-finger swipe switching while at 1×.
 */
export function ImageViewer({
  images,
  initialIndex,
  onClose,
  onDownload,
}: ImageViewerProps) {
  const t = useT();
  const [index, setIndex] = useState(() =>
    Math.min(Math.max(initialIndex, 0), Math.max(images.length - 1, 0)),
  );
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [viewport, setViewport] = useState<Size>({ width: 0, height: 0 });
  const [imageSize, setImageSize] = useState<Size>({ width: 0, height: 0 });

  const shellRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const gestureRef = useRef<GestureState | null>(null);
  const lastTapRef = useRef<number | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const updateViewport = () => {
      const rect = stageRef.current?.getBoundingClientRect();
      if (rect) {
        setViewport({ width: rect.width, height: rect.height });
      }
    };
    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  useEffect(() => {
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const { body } = document;
    const previousOverflow = body.style.overflow;
    body.style.overflow = "hidden";
    shellRef.current?.focus();

    return () => {
      body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, []);

  const resetZoom = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setDragging(false);
    lastTapRef.current = null;
  }, []);

  const goPrevious = useCallback(() => {
    if (index <= 0) return;
    setIndex(index - 1);
    resetZoom();
  }, [index, resetZoom]);

  const goNext = useCallback(() => {
    if (index >= images.length - 1) return;
    setIndex(index + 1);
    resetZoom();
  }, [images.length, index, resetZoom]);

  const zoomBy = useCallback(
    (delta: number) => {
      const nextScale = clampScale(scale + delta);
      setScale(nextScale);
      setOffset((prev) =>
        nextScale <= 1
          ? { x: 0, y: 0 }
          : clampPanOffset(prev, nextScale, viewport, imageSize),
      );
    },
    [imageSize, scale, viewport],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key === "Tab") {
        const shell = shellRef.current;
        if (!shell) return;
        const focusable = Array.from(
          shell.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
        );
        if (focusable.length === 0) {
          event.preventDefault();
          shell.focus();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (document.activeElement === shell) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        } else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goPrevious();
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        goNext();
        return;
      }
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        zoomBy(ZOOM_STEP);
        return;
      }
      if (event.key === "-") {
        event.preventDefault();
        zoomBy(-ZOOM_STEP);
        return;
      }
      if (event.key === "0") {
        event.preventDefault();
        resetZoom();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goNext, goPrevious, resetZoom, zoomBy]);

  const current = images[index];

  if (typeof document === "undefined" || !current) return null;

  function handleTouchStart(event: ReactTouchEvent<HTMLDivElement>) {
    if (event.touches.length === 2) {
      const first = event.touches[0];
      const second = event.touches[1];
      gestureRef.current = {
        mode: "pinch",
        startX: 0,
        startY: 0,
        startedAt: Date.now(),
        startScale: scale,
        startOffset: offset,
        startDistance: distanceBetweenPoints(
          { x: first.clientX, y: first.clientY },
          { x: second.clientX, y: second.clientY },
        ),
        startMidpoint: midpointOfPoints(
          { x: first.clientX, y: first.clientY },
          { x: second.clientX, y: second.clientY },
        ),
      };
      setDragging(true);
      return;
    }

    if (event.touches.length === 1) {
      const touch = event.touches[0];
      const panning = scale > 1.01;
      gestureRef.current = {
        mode: panning ? "pan" : "swipe",
        startX: touch.clientX,
        startY: touch.clientY,
        startedAt: Date.now(),
        startScale: scale,
        startOffset: offset,
        startDistance: 0,
        startMidpoint: { x: 0, y: 0 },
      };
      setDragging(panning);
    }
  }

  function handleTouchMove(event: ReactTouchEvent<HTMLDivElement>) {
    const gesture = gestureRef.current;
    if (!gesture) return;

    if (event.touches.length === 2) {
      const first = event.touches[0];
      const second = event.touches[1];
      const distance = distanceBetweenPoints(
        { x: first.clientX, y: first.clientY },
        { x: second.clientX, y: second.clientY },
      );
      const midpoint = midpointOfPoints(
        { x: first.clientX, y: first.clientY },
        { x: second.clientX, y: second.clientY },
      );
      const nextScale = scaleFromPinch(
        gesture.startDistance,
        distance,
        gesture.startScale,
      );
      setScale(nextScale);
      setOffset(
        clampPanOffset(
          {
            x: gesture.startOffset.x + midpoint.x - gesture.startMidpoint.x,
            y: gesture.startOffset.y + midpoint.y - gesture.startMidpoint.y,
          },
          nextScale,
          viewport,
          imageSize,
        ),
      );
      return;
    }

    if (event.touches.length === 1 && gesture.mode === "pan") {
      const touch = event.touches[0];
      setOffset(
        clampPanOffset(
          {
            x: gesture.startOffset.x + touch.clientX - gesture.startX,
            y: gesture.startOffset.y + touch.clientY - gesture.startY,
          },
          scale,
          viewport,
          imageSize,
        ),
      );
    }
  }

  function handleTouchEnd(event: ReactTouchEvent<HTMLDivElement>) {
    const gesture = gestureRef.current;
    if (!gesture) return;

    if (event.touches.length === 1) {
      const touch = event.touches[0];
      gestureRef.current = {
        mode: scale > 1.01 ? "pan" : "swipe",
        startX: touch.clientX,
        startY: touch.clientY,
        startedAt: Date.now(),
        startScale: scale,
        startOffset: offset,
        startDistance: 0,
        startMidpoint: { x: 0, y: 0 },
        fromPinch: gesture.mode === "pinch",
      };
      setDragging(scale > 1.01);
      return;
    }

    if (event.touches.length > 1) return;

    gestureRef.current = null;
    setDragging(false);

    const touch = event.changedTouches[0];
    if (!touch) return;
    const dx = touch.clientX - gesture.startX;
    const dy = touch.clientY - gesture.startY;
    const duration = Date.now() - gesture.startedAt;
    const isTap =
      Math.abs(dx) < TAP_MAX_MOVEMENT_PX &&
      Math.abs(dy) < TAP_MAX_MOVEMENT_PX &&
      duration < TAP_MAX_DURATION_MS;

    if (isTap && gesture.mode !== "pinch" && !gesture.fromPinch) {
      const now = Date.now();
      if (isDoubleTap(lastTapRef.current, now)) {
        lastTapRef.current = null;
        if (scale > 1.01) {
          resetZoom();
        } else {
          zoomBy(DOUBLE_TAP_ZOOM - 1);
        }
      } else {
        lastTapRef.current = now;
      }
      return;
    }

    if (gesture.mode !== "swipe") return;
    if (scale > 1.01) return;

    const direction = resolveImageSwipe(dx, dy, duration);
    if (direction === -1) goPrevious();
    if (direction === 1) goNext();
  }

  function handleTouchCancel() {
    gestureRef.current = null;
    setDragging(false);
  }

  return createPortal(
    <div
      ref={shellRef}
      role="dialog"
      aria-modal="true"
      aria-label={t("viewer.title")}
      tabIndex={-1}
      className="image-viewer-shell fixed inset-0 z-[90] flex flex-col outline-none"
    >
      <header className="flex items-start justify-between gap-3 px-3 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="min-w-0">
          <p className="image-viewer-title truncate text-sm font-medium">
            {current.fileName}
          </p>
          <p className="image-viewer-meta mt-0.5 text-[11px] tabular-nums">
            {t("viewer.counter", {
              current: index + 1,
              total: images.length,
            })}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {onDownload && current.attachmentId ? (
            <button
              type="button"
              className="image-viewer-control touch-target inline-flex items-center justify-center rounded-full"
              aria-label={t("viewer.download")}
              onClick={() => onDownload(current)}
            >
              <Download className="h-4 w-4" />
            </button>
          ) : null}
          <button
            type="button"
            className="image-viewer-control touch-target inline-flex items-center justify-center rounded-full"
            aria-label={t("viewer.close")}
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div
        ref={stageRef}
        className="image-viewer-stage relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-2"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
      >
        <img
          src={current.url}
          alt={current.fileName}
          draggable={false}
          onLoad={(event) =>
            setImageSize({
              width: event.currentTarget.naturalWidth,
              height: event.currentTarget.naturalHeight,
            })
          }
          className={clsx(
            "image-viewer-image max-h-full max-w-full object-contain",
            dragging && "image-viewer-image--dragging",
            scale > 1.01 && "image-viewer-image--zoomed",
          )}
          style={{
            transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`,
          }}
        />
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 px-3 pt-2">
        <button
          type="button"
          className="image-viewer-control touch-target inline-flex items-center justify-center rounded-full"
          aria-label={t("viewer.previous")}
          disabled={index === 0}
          onClick={goPrevious}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          type="button"
          className="image-viewer-control touch-target inline-flex items-center justify-center rounded-full"
          aria-label={t("viewer.zoomOut")}
          disabled={scale <= 1.01}
          onClick={() => zoomBy(-ZOOM_STEP)}
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="image-viewer-control touch-target inline-flex items-center justify-center rounded-full"
          aria-label={t("viewer.reset")}
          disabled={scale <= 1.01 && offset.x === 0 && offset.y === 0}
          onClick={resetZoom}
        >
          <RotateCcw className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="image-viewer-control touch-target inline-flex items-center justify-center rounded-full"
          aria-label={t("viewer.zoomIn")}
          disabled={scale >= 4}
          onClick={() => zoomBy(ZOOM_STEP)}
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="image-viewer-control touch-target inline-flex items-center justify-center rounded-full"
          aria-label={t("viewer.next")}
          disabled={index >= images.length - 1}
          onClick={goNext}
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
      <p className="image-viewer-meta px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 text-center text-[11px]">
        {t("viewer.hint")}
      </p>
    </div>,
    document.body,
  );
}
