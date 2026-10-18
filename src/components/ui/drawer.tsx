"use client";

import {
  OverlaySurface,
  type OverlaySurfaceProps,
} from "./overlay/overlay-surface";

export type DrawerProps = Omit<OverlaySurfaceProps, "size"> & {
  size?: "sm" | "md" | "lg" | "xl" | "full";
  side?: "right" | "left";
};

// 侧边抽屉：适合设置、编辑等需要保留页面上下文的较长表单。
export function Drawer({ side = "right", size = "md", ...props }: DrawerProps) {
  return (
    <OverlaySurface
      {...props}
      kind="drawer"
      side={side}
      align="center"
      size={size}
    />
  );
}
