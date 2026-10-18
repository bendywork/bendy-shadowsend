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

// 方形纯图标按钮，与 Button 共用尺寸/圆角/状态；配合 <Tooltip> 使用。
export const IconButton = forwardRef<HTMLButtonElement, Props>(function IconButton(
  {
    active,
    danger,
    loading = false,
    size = "md",
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
        `icon-btn--${size}`,
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
