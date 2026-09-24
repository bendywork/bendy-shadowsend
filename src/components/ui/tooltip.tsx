"use client";

import clsx from "clsx";
import { useRef, useState, type ReactNode } from "react";

// 悬停约 0.8s 后浮出的小说明气泡（键盘聚焦时立即显示，保证可达性）。
export function Tooltip({
  label,
  children,
  side = "bottom",
  delay = 800,
}: {
  label: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom";
  delay?: number;
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };
  const show = () => {
    clear();
    timer.current = setTimeout(() => setOpen(true), delay);
  };
  const hide = () => {
    clear();
    setOpen(false);
  };

  if (!label) return <>{children}</>;

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={() => setOpen(true)}
      onBlur={hide}
    >
      {children}
      <span
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
