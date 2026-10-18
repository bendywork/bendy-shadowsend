"use client";

import clsx from "clsx";

export function SwitchBtn({
  checked,
  disabled,
  onToggle,
}: {
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onToggle}
      className={clsx(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-ui duration-base",
        checked
          ? "border-action-border bg-action/50"
          : "border-line-strong bg-elevated-strong",
        disabled
          ? "cursor-not-allowed opacity-60"
          : "hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action-border",
      )}
    >
      <span
        className={clsx(
          "inline-block h-5 w-5 rounded-full shadow-sm transition-transform duration-base",
          checked ? "translate-x-5 bg-action-fg" : "translate-x-0.5 bg-ink-soft",
        )}
      />
    </button>
  );
}
