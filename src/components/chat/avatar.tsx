import clsx from "clsx";
import { resolveAvatarColor } from "@/lib/avatar-color";

type AvatarProps = {
  initial: string;
  color: string;
  className?: string;
};

export function Avatar({ initial, color, className }: AvatarProps) {
  const backgroundColor = resolveAvatarColor(color, initial);

  return (
    <div
      className={clsx(
        "inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-avatar-fg",
        className,
      )}
      style={{ backgroundColor }}
      aria-hidden
    >
      {initial}
    </div>
  );
}

