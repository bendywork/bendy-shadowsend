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

/**
 * 统一按钮：loading 时自动禁用并显示 spinner，图标位由 spinner 替换，
 * 避免重复提交和布局跳动。API 与 ui-03 按钮体系保持一致。
 */
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
