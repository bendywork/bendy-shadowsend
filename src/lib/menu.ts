export type MenuAnchorRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export type MenuSize = {
  width: number;
  height: number;
};

export type MenuViewport = {
  width: number;
  height: number;
};

export type MenuPlacement = "bottom" | "top";

export type MenuPosition = {
  top: number;
  left: number;
  placement: MenuPlacement;
};

export const MENU_GAP = 6;
export const MENU_VIEWPORT_PADDING = 8;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), Math.max(min, max));

/**
 * Positions a fixed menu next to its anchor. The menu prefers opening below
 * the anchor, flips above when there is not enough room, and always stays
 * inside the viewport padding.
 */
export function computeMenuPosition(
  anchor: MenuAnchorRect,
  menu: MenuSize,
  viewport: MenuViewport,
  align: "start" | "end" = "end",
): MenuPosition {
  const maxLeft = viewport.width - menu.width - MENU_VIEWPORT_PADDING;
  const preferredLeft =
    align === "end" ? anchor.left + anchor.width - menu.width : anchor.left;
  const left = clamp(preferredLeft, MENU_VIEWPORT_PADDING, maxLeft);

  const belowTop = anchor.top + anchor.height + MENU_GAP;
  const aboveTop = anchor.top - MENU_GAP - menu.height;
  const fitsBelow =
    belowTop + menu.height <= viewport.height - MENU_VIEWPORT_PADDING;
  const fitsAbove = aboveTop >= MENU_VIEWPORT_PADDING;
  const placement: MenuPlacement = !fitsBelow && fitsAbove ? "top" : "bottom";

  const maxTop = viewport.height - menu.height - MENU_VIEWPORT_PADDING;
  const top = clamp(
    placement === "top" ? aboveTop : belowTop,
    MENU_VIEWPORT_PADDING,
    maxTop,
  );

  return { top, left, placement };
}
