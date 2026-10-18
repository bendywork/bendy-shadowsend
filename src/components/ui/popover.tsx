"use client";

import type { ReactNode } from "react";
import { Modal } from "./modal";

// 轻量弹层面板：保留原有 API，底层复用 Modal 的焦点管理、Esc/遮罩关闭与滚动锁定。
export function Popover({
  open,
  onClose,
  title,
  children,
  closeLabel,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  closeLabel?: string;
  className?: string;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      closeLabel={closeLabel}
      size="sm"
      align="top"
      panelClassName={className}
    >
      {children}
    </Modal>
  );
}
