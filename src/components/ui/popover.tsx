"use client";

import clsx from "clsx";
import { useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useDialogKeyboard } from "@/lib/use-dialog-keyboard";

// 轻量弹层面板：portal 渲染到 body（规避祖先 overflow 裁剪），
// 半透明背景遮罩 + 居中卡片，点击遮罩或按 Esc 关闭；打开时锁定滚动、
// 焦点移入首个可聚焦控件（可用 data-autofocus 指定），Tab 圈定、关闭后归还焦点。
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
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);

  useDialogKeyboard({
    active: open,
    containerRef: panelRef,
    onClose,
  });

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="popover-backdrop fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto px-4 py-[12vh]"
      onMouseDown={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        className={clsx("popover-panel popover-panel--in w-full max-w-sm p-4", className)}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : closeLabel}
        tabIndex={-1}
      >
        {title ? (
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 id={titleId} className="text-sm font-semibold text-ink">{title}</h3>
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
