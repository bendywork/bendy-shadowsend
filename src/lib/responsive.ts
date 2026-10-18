// Responsive breakpoint contract (REQ-202610-0502 / ui-39).
//
// Single source of truth for layout decisions in JS. The same values are
// mirrored as `--breakpoint-*` tokens in `src/app/globals.css`; the CSS
// contract test keeps both sides in sync.
//
// Matrix:
//   mobile  (< 768px)   single column, rooms + members as drawers
//   tablet  (768–1279)  two columns, rooms column + chat, members drawer
//   desktop (>= 1280)   three columns, collapsible rooms / members columns

export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
} as const;

export type BreakpointName = keyof typeof BREAKPOINTS;
export type LayoutMode = "mobile" | "tablet" | "desktop";
export type PanelPlacement = "column" | "drawer";
export type PanelSide = "left" | "right";

export type RoomLayout = {
  mode: LayoutMode;
  columns: 1 | 2 | 3;
  rooms: PanelPlacement;
  members: PanelPlacement;
  gridTemplate: string;
};

export function getLayoutMode(width: number): LayoutMode {
  if (!Number.isFinite(width) || width < BREAKPOINTS.md) return "mobile";
  if (width < BREAKPOINTS.xl) return "tablet";
  return "desktop";
}

export function resolveRoomLayout(width: number): RoomLayout {
  const mode = getLayoutMode(width);

  if (mode === "desktop") {
    return {
      mode,
      columns: 3,
      rooms: "column",
      members: "column",
      gridTemplate: getDesktopGridTemplate(true, true),
    };
  }

  if (mode === "tablet") {
    return {
      mode,
      columns: 2,
      rooms: "column",
      members: "drawer",
      gridTemplate: "280px minmax(0, 1fr)",
    };
  }

  return {
    mode,
    columns: 1,
    rooms: "drawer",
    members: "drawer",
    gridTemplate: "minmax(0, 1fr)",
  };
}

// Desktop grid adapts to the persisted sidebar preferences. At tablet the
// rooms column is always present, and members are a drawer.
export function getDesktopGridTemplate(
  roomsVisible: boolean,
  membersVisible: boolean,
): string {
  if (roomsVisible && membersVisible) return "290px minmax(0, 1fr) 290px";
  if (roomsVisible) return "290px minmax(0, 1fr)";
  if (membersVisible) return "minmax(0, 1fr) 290px";
  return "minmax(0, 1fr)";
}

export function getPanelSide(panel: "rooms" | "members"): PanelSide {
  return panel === "rooms" ? "left" : "right";
}

export function isDrawerAt(
  mode: LayoutMode,
  panel: "rooms" | "members",
): boolean {
  if (panel === "rooms") return mode === "mobile";
  return mode !== "desktop";
}
