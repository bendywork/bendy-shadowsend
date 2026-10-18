"use client";

import clsx from "clsx";
import { LoaderCircle } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  danger?: boolean;
  loading?: boolean;
  size?: "sm" | "md";
};

// 方形纯图标按钮，主题感知；loading 时替换为 spinner 并自动禁用。
export const IconButton = forwardRef<HTMLButtonElement, Props>(function IconButton(
  {
    active,
    danger,
    loading = false,
    size,
    className,
    children,
    type,
    disabled,
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
        "icon-btn",
        size && `icon-btn--${size}`,
        active && "icon-btn--active",
        danger && "icon-btn--danger",
        className,
      )}
      {...rest}
    >
      {loading ? <LoaderCircle className="btn__spinner" aria-hidden="true" /> : children}
    </button>
  );
});
