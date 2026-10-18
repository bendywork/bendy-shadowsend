// Touch and gesture primitives for the mobile room experience (REQ-202610-0747).
// Pure math lives here so the interaction layer stays thin and testable.

export const TOUCH_TARGET_MIN_PX = 44;
export const EDGE_SWIPE_ZONE_PX = 24;
export const EDGE_SWIPE_TRIGGER_PX = 64;
export const EDGE_SWIPE_VELOCITY_PX_PER_MS = 0.5;
export const EDGE_SWIPE_MAX_VERTICAL_PX = 72;
export const LONG_PRESS_DELAY_MS = 450;
export const LONG_PRESS_MOVE_TOLERANCE_PX = 12;
export const PINCH_MIN_SCALE = 1;
export const PINCH_MAX_SCALE = 4;
export const IMAGE_SWIPE_TRIGGER_PX = 56;
export const IMAGE_SWIPE_VELOCITY_PX_PER_MS = 0.45;
export const DOUBLE_TAP_MAX_GAP_MS = 300;

export type Point = { x: number; y: number };
export type Size = { width: number; height: number };
export type PanelSide = "left" | "right";
export type EdgeSwipeResult = {
  action: "open" | "close";
  side: PanelSide;
} | null;

export type EdgeSwipeInput = {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  durationMs: number;
  viewportWidth: number;
  openSide: PanelSide | null;
};

function isHorizontalGesture(dx: number, dy: number) {
  return Math.abs(dx) > Math.abs(dy) * 1.2;
}

function passesSwipeThreshold(dx: number, durationMs: number) {
  const velocity = Math.abs(dx) / Math.max(durationMs, 1);
  return (
    Math.abs(dx) >= EDGE_SWIPE_TRIGGER_PX ||
    velocity >= EDGE_SWIPE_VELOCITY_PX_PER_MS
  );
}

/**
 * Resolve an edge swipe into a drawer action.
 * - No drawer open: swiping inward from a screen edge opens that drawer.
 * - A drawer open: swiping toward its own edge closes it.
 */
export function resolveEdgeSwipe(input: EdgeSwipeInput): EdgeSwipeResult {
  const dx = input.endX - input.startX;
  const dy = input.endY - input.startY;

  if (Math.abs(dy) > EDGE_SWIPE_MAX_VERTICAL_PX) return null;
  if (!isHorizontalGesture(dx, dy)) return null;
  if (!passesSwipeThreshold(dx, input.durationMs)) return null;

  if (input.openSide === "left") {
    return dx < 0 ? { action: "close", side: "left" } : null;
  }
  if (input.openSide === "right") {
    return dx > 0 ? { action: "close", side: "right" } : null;
  }

  if (input.startX <= EDGE_SWIPE_ZONE_PX && dx > 0) {
    return { action: "open", side: "left" };
  }
  if (input.startX >= input.viewportWidth - EDGE_SWIPE_ZONE_PX && dx < 0) {
    return { action: "open", side: "right" };
  }
  return null;
}

export function isLongPressGesture(input: {
  durationMs: number;
  movementPx: number;
}): boolean {
  return (
    input.durationMs >= LONG_PRESS_DELAY_MS &&
    input.movementPx <= LONG_PRESS_MOVE_TOLERANCE_PX
  );
}

export function distanceBetweenPoints(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function midpointOfPoints(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function clampScale(
  value: number,
  min = PINCH_MIN_SCALE,
  max = PINCH_MAX_SCALE,
): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function scaleFromPinch(
  startDistance: number,
  currentDistance: number,
  startScale: number,
): number {
  if (startDistance <= 0 || !Number.isFinite(currentDistance)) {
    return clampScale(startScale);
  }
  return clampScale((currentDistance / startDistance) * startScale);
}

export function containSize(image: Size, viewport: Size): Size {
  if (
    image.width <= 0 ||
    image.height <= 0 ||
    viewport.width <= 0 ||
    viewport.height <= 0
  ) {
    return { width: 0, height: 0 };
  }
  const ratio = Math.min(
    viewport.width / image.width,
    viewport.height / image.height,
  );
  return { width: image.width * ratio, height: image.height * ratio };
}

export function clampPanOffset(
  offset: Point,
  scale: number,
  viewport: Size,
  image: Size,
): Point {
  const fitted = containSize(image, viewport);
  const maxX = Math.max(0, (fitted.width * scale - viewport.width) / 2);
  const maxY = Math.max(0, (fitted.height * scale - viewport.height) / 2);
  return {
    x: Math.min(maxX, Math.max(-maxX, offset.x)),
    y: Math.min(maxY, Math.max(-maxY, offset.y)),
  };
}

/**
 * Returns -1 for the previous image, 1 for the next image, 0 for no switch.
 */
export function resolveImageSwipe(
  dx: number,
  dy: number,
  durationMs: number,
): -1 | 0 | 1 {
  if (Math.abs(dy) > Math.abs(dx) * 0.8) return 0;
  const velocity = Math.abs(dx) / Math.max(durationMs, 1);
  const qualifies =
    Math.abs(dx) >= IMAGE_SWIPE_TRIGGER_PX ||
    velocity >= IMAGE_SWIPE_VELOCITY_PX_PER_MS;
  if (!qualifies) return 0;
  return dx > 0 ? -1 : 1;
}

export function isDoubleTap(
  previousTapAt: number | null,
  now: number,
  maxGapMs = DOUBLE_TAP_MAX_GAP_MS,
): boolean {
  return previousTapAt !== null && now - previousTapAt <= maxGapMs;
}

export function meetsTouchTarget(size: Size): boolean {
  return (
    size.width >= TOUCH_TARGET_MIN_PX && size.height >= TOUCH_TARGET_MIN_PX
  );
}
