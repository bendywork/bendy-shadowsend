import clsx from "clsx";
import { resolveAvatarForeground } from "@/lib/avatar";

type AvatarProps = {
  initial: string;
  color: string;
  className?: string;
};

export function Avatar({ initial, color, className }: AvatarProps) {
  const foreground = resolveAvatarForeground(color);

  return (
    <div
      className={clsx(
        "inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold",
        !foreground && "text-avatar-fg",
        className,
      )}
      style={{
        backgroundColor: color,
        ...(foreground ? { color: foreground } : {}),
      }}
      aria-hidden
    >
      {initial}
    </div>
  );
}

