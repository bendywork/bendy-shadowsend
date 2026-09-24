"use client";

import clsx from "clsx";
import { forwardRef, type ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  danger?: boolean;
};

// 方形纯图标按钮，主题感知，配合 <Tooltip> 使用。
export const IconButton = forwardRef<HTMLButtonElement, Props>(function IconButton(
  { active, danger, className, type, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      className={clsx(
        "icon-btn",
        active && "icon-btn--active",
        danger && "icon-btn--danger",
        className,
      )}
      {...rest}
    />
  );
});
