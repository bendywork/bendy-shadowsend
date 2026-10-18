"use client";

import clsx from "clsx";
import { LoaderCircle } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  block?: boolean;
};

// 统一按钮：四级语义 × 两档尺寸 × loading/disabled 态。
// 主按钮按 dc-02 反色，危险按钮是唯一使用语义红的常规按钮。
export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  {
    variant = "secondary",
    size = "md",
    loading = false,
    icon,
    block = false,
    className,
    children,
    disabled,
    type,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      data-loading={loading || undefined}
      className={clsx(
        "btn",
        `btn--${variant}`,
        `btn--${size}`,
        block && "btn--block",
        className,
      )}
      {...rest}
    >
      {loading ? <LoaderCircle className="btn__spinner" aria-hidden="true" /> : icon}
      {children}
    </button>
  );
});
