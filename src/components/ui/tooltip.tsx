"use client";

import clsx from "clsx";
import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";

/** Shared hover delay for every tooltip in the product. */
export const TOOLTIP_DELAY_MS = 500;
/** Short grace period so pointer jitter does not flicker the bubble. */
export const TOOLTIP_HIDE_DELAY_MS = 120;

type DescribedChildProps = {
  "aria-describedby"?: string;
};

// 悬停约 0.5s 后浮出的小说明气泡（键盘聚焦时立即显示，保证可达性）。
export function Tooltip({
  label,
  children,
  side = "bottom",
  delay = TOOLTIP_DELAY_MS,
}: {
  label: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom";
  delay?: number;
}) {
  const [open, setOpen] = useState(false);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipId = useId();

  const clearTimers = () => {
    if (showTimer.current) {
      clearTimeout(showTimer.current);
      showTimer.current = null;
    }
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };

  const show = () => {
    clearTimers();
    showTimer.current = setTimeout(() => setOpen(true), delay);
  };
  const showNow = () => {
    clearTimers();
    setOpen(true);
  };
  const hide = () => {
    clearTimers();
    hideTimer.current = setTimeout(() => setOpen(false), TOOLTIP_HIDE_DELAY_MS);
  };

  useEffect(() => {
    return () => {
      if (showTimer.current) clearTimeout(showTimer.current);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!label) return <>{children}</>;

  const describedChild = isValidElement(children)
    ? cloneElement(children as ReactElement<DescribedChildProps>, {
        "aria-describedby": open ? tooltipId : undefined,
      })
    : children;

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={showNow}
      onBlur={hide}
    >
      {describedChild}
      <span
        id={tooltipId}
        role="tooltip"
        aria-hidden={!open}
        className={clsx(
          "tooltip-bubble",
          side === "top" ? "tooltip-bubble--top" : "tooltip-bubble--bottom",
          open && "tooltip-bubble--open",
        )}
      >
        {label}
      </span>
    </span>
  );
}
