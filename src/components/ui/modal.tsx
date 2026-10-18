"use client";

import {
  OverlaySurface,
  type OverlayAlign,
  type OverlaySurfaceProps,
} from "./overlay/overlay-surface";

export type ModalProps = Omit<OverlaySurfaceProps, "size"> & {
  size?: "sm" | "md" | "lg" | "xl" | "full";
  align?: OverlayAlign;
};

// 居中（或顶部对齐）模态框：遮罩点击 / Esc 关闭、焦点环、滚动锁定均由底层统一处理。
export function Modal({ align = "center", size = "md", ...props }: ModalProps) {
  return (
    <OverlaySurface
      {...props}
      kind="modal"
      side="right"
      align={align}
      size={size}
    />
  );
}
