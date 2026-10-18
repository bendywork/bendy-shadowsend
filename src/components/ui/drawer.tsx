"use client";

import type { ReactNode } from "react";
import { Popover, type PopoverSize } from "./popover";

export type DrawerProps = {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  closeLabel?: string;
  className?: string;
  bodyClassName?: string;
  side?: "right" | "left";
  size?: PopoverSize;
};

// 贴边抽屉：复用 Popover 的 portal / 焦点陷阱 / 滚动锁定，
// 只改变呈现形态，适合设置、编辑等较长表单。
export function Drawer({ side = "right", size = "md", ...props }: DrawerProps) {
  return <Popover {...props} variant="drawer" side={side} size={size} />;
}
