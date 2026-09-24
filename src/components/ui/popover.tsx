"use client";

import clsx from "clsx";
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

// 轻量弹层面板：portal 渲染到 body（规避祖先 overflow 裁剪），
// 半透明背景遮罩 + 居中卡片，点击遮罩或按 Esc 关闭。主题感知（.popover-panel）。
export function Popover({
  open,
  onClose,
  title,
  children,
  closeLabel = "关闭",
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  closeLabel?: string;
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-[12vh] backdrop-blur-sm"
      onMouseDown={onClose}
      role="presentation"
    >
      <div
        className={clsx("popover-panel w-full max-w-sm p-4", className)}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {title ? (
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-[color:var(--text-primary)]">{title}</h3>
            <button
              type="button"
              onClick={onClose}
              aria-label={closeLabel}
              className="icon-btn h-7 w-7"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : null}
        {children}
      </div>
    </div>,
    document.body,
  );
}
