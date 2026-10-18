"use client";

import {
  OverlaySurface,
  type OverlaySurfaceProps,
} from "./overlay/overlay-surface";

export type SheetProps = Omit<OverlaySurfaceProps, "size"> & {
  size?: "sm" | "md" | "lg" | "xl" | "full";
};

// 底部动作面板（移动端优先）：从屏幕底部滑入，内容区可滚动。
export function Sheet({ size = "full", ...props }: SheetProps) {
  return (
    <OverlaySurface
      {...props}
      kind="sheet"
      side="bottom"
      align="center"
      size={size}
    />
  );
}
