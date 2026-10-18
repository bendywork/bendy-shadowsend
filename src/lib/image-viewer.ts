export type ImageViewerItem = {
  id: string;
  src: string;
  fileName: string;
  /** Optional download handler. When absent the viewer falls back to an anchor download. */
  onDownload?: () => Promise<void> | void;
};

export type ImageViewerAction =
  | "close"
  | "previous"
  | "next"
  | "first"
  | "last"
  | "zoom-in"
  | "zoom-out"
  | "reset";

export const IMAGE_VIEWER_MIN_ZOOM = 1;
export const IMAGE_VIEWER_MAX_ZOOM = 4;
export const IMAGE_VIEWER_ZOOM_STEP = 0.25;

/** Clamp a possibly invalid index into `[0, count - 1]`. */
export function clampImageIndex(index: number, count: number): number {
  if (!Number.isFinite(index) || count <= 0) return 0;
  return Math.min(count - 1, Math.max(0, Math.trunc(index)));
}

/** Move through images with wrap-around, used by arrow keys and prev/next buttons. */
export function stepImageIndex(index: number, count: number, delta: number): number {
  if (count <= 0) return 0;
  if (!Number.isFinite(index) || !Number.isFinite(delta)) return 0;
  return ((Math.trunc(index) + Math.trunc(delta)) % count + count) % count;
}

/** Zoom is relative to the fit-to-stage scale (1 = fit). */
export function clampZoom(value: number): number {
  if (!Number.isFinite(value)) return IMAGE_VIEWER_MIN_ZOOM;
  return Math.min(
    IMAGE_VIEWER_MAX_ZOOM,
    Math.max(IMAGE_VIEWER_MIN_ZOOM, value),
  );
}

export function stepZoom(value: number, delta: number): number {
  if (!Number.isFinite(delta)) return clampZoom(value);
  return clampZoom(value + delta);
}

export function getZoomPercent(zoom: number): number {
  return Math.round(clampZoom(zoom) * 100);
}

/** Maximum pan offset for one axis when the image is scaled beyond fit. */
export function getPanLimit(stageSize: number, zoom: number): number {
  if (!Number.isFinite(stageSize) || stageSize <= 0) return 0;
  return Math.max(0, (stageSize * (clampZoom(zoom) - 1)) / 2);
}

export function clampPanOffset(value: number, limit: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(limit) || limit <= 0) return 0;
  return Math.min(limit, Math.max(-limit, value));
}

/**
 * Keyboard map for the viewer:
 *   Esc close · ←/→ switch · Home/End first/last · +/- zoom · 0 reset.
 */
export function getImageViewerAction(
  key: string,
  hasMultiple: boolean,
): ImageViewerAction | null {
  switch (key) {
    case "Escape":
      return "close";
    case "ArrowLeft":
      return hasMultiple ? "previous" : null;
    case "ArrowRight":
      return hasMultiple ? "next" : null;
    case "Home":
      return hasMultiple ? "first" : null;
    case "End":
      return hasMultiple ? "last" : null;
    case "+":
    case "=":
      return "zoom-in";
    case "-":
    case "_":
      return "zoom-out";
    case "0":
      return "reset";
    default:
      return null;
  }
}
