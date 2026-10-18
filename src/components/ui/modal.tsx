"use client";

import clsx from "clsx";
import { useId, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useDialogKeyboard } from "@/lib/use-dialog-keyboard";

export type ModalSize = "sm" | "md" | "lg" | "xl";

type ModalContentProps = {
  title: ReactNode;
  description?: ReactNode;
  titleId: string;
  descriptionId: string;
  closeLabel: string;
  onClose: () => void;
  closeDisabled?: boolean;
  size?: ModalSize;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
  panelRef?: RefObject<HTMLElement | null>;
};

/**
 * 纯展示外壳，便于 SSR 测试。交互层由 Modal 注入。
 * 使用原生 section + role=dialog，标题/描述通过 id 关联。
 */
export function ModalContent({
  title,
  description,
  titleId,
  descriptionId,
  closeLabel,
  onClose,
  closeDisabled = false,
  size = "md",
  className,
  bodyClassName,
  children,
  panelRef,
}: ModalContentProps) {
  return (
    <div
      className="kb-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !closeDisabled) onClose();
      }}
    >
      <section
        ref={panelRef}
        className={clsx("kb-modal", `kb-modal--${size}`, className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="kb-modal__header">
          <div className="min-w-0">
            <h2 id={titleId} className="kb-modal__title">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="kb-modal__description">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="icon-btn kb-modal__close h-8 w-8 shrink-0"
            aria-label={closeLabel}
            onClick={onClose}
            disabled={closeDisabled}
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className={clsx("kb-modal__body", bodyClassName)}>{children}</div>
      </section>
    </div>
  );
}

type ModalProps = Omit<
  ModalContentProps,
  "titleId" | "descriptionId" | "panelRef"
> & {
  open: boolean;
};

/**
 * 页面级模态框：portal 到 body，统一 Esc / 焦点陷阱 / 焦点归还 / 滚动锁定。
 * 初始焦点优先 [data-autofocus]，否则首个可聚焦元素。
 */
export function Modal({ open, onClose, closeDisabled, ...contentProps }: ModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLElement | null>(null);

  useDialogKeyboard({
    active: open,
    containerRef: panelRef,
    onClose,
    closeDisabled,
  });

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <ModalContent
      {...contentProps}
      onClose={onClose}
      closeDisabled={closeDisabled}
      titleId={titleId}
      descriptionId={descriptionId}
      panelRef={panelRef}
    />,
    document.body,
  );
}
