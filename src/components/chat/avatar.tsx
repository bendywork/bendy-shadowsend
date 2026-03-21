import clsx from "clsx";

type AvatarProps = {
  initial: string;
  color: string;
  className?: string;
};

export function Avatar({ initial, color, className }: AvatarProps) {
  return (
    <div
      className={clsx(
        "inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white",
        className,
      )}
      style={{ backgroundColor: color }}
      aria-hidden
    >
      {initial}
    </div>
  );
}

