import clsx from "clsx";
import type { ReactNode } from "react";

export type EmptyStateVariant =
  | "rooms"
  | "messages"
  | "members"
  | "approvals"
  | "generic";

type EmptyStateProps = {
  variant?: EmptyStateVariant;
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
};

export function EmptyState({
  variant = "generic",
  title,
  description,
  action,
  compact = false,
  className,
}: EmptyStateProps) {
  return (
    <div
      data-empty-state={variant}
      data-compact={compact ? "true" : "false"}
      className={clsx(
        "flex flex-col items-center justify-center text-center",
        compact
          ? "gap-2 rounded-lg bg-panel/40 px-3 py-4"
          : "gap-4 rounded-2xl bg-panel/40 px-6 py-10",
        className,
      )}
    >
      <EmptyIllustration variant={variant} compact={compact} />
      <div className="space-y-1.5">
        <p
          className={clsx(
            "font-medium text-ink-soft",
            compact ? "text-xs" : "text-sm",
          )}
        >
          {title}
        </p>
        {description ? (
          <p
            className={clsx(
              "max-w-xs text-balance text-ink-faint",
              compact ? "text-[11px]" : "text-xs",
            )}
          >
            {description}
          </p>
        ) : null}
      </div>
      {action ? (
        <div data-empty-action="true" className="pt-1">
          {action}
        </div>
      ) : null}
    </div>
  );
}

function EmptyIllustration({
  variant,
  compact,
}: {
  variant: EmptyStateVariant;
  compact: boolean;
}) {
  return (
    <svg
      data-illustration={variant}
      aria-hidden="true"
      viewBox="0 0 96 72"
      className={clsx("shrink-0 text-ink-faint", compact ? "h-8 w-11" : "h-[72px] w-24")}
      fill="none"
    >
      {variant === "rooms" ? <RoomsArt /> : null}
      {variant === "messages" ? <MessagesArt /> : null}
      {variant === "members" ? <MembersArt /> : null}
      {variant === "approvals" ? <ApprovalsArt /> : null}
      {variant === "generic" ? <GenericArt /> : null}
    </svg>
  );
}

function RoomsArt() {
  return (
    <>
      <rect x="22" y="12" width="56" height="42" rx="8" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
      <rect x="16" y="20" width="56" height="42" rx="8" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
      <rect x="28" y="28" width="32" height="30" rx="6" stroke="currentColor" strokeWidth="1.5" opacity="0.85" />
      <path d="M48 28v30" stroke="currentColor" strokeWidth="1.5" opacity="0.45" />
      <circle cx="52.5" cy="44" r="1.6" fill="currentColor" opacity="0.8" />
    </>
  );
}

function MessagesArt() {
  return (
    <>
      <path d="M14 18h46a6 6 0 0 1 6 6v18a6 6 0 0 1-6 6H38l-9 8v-8h-9a6 6 0 0 1-6-6V24a6 6 0 0 1 6-6Z" stroke="currentColor" strokeWidth="1.5" opacity="0.55" />
      <path d="M52 34h26a4 4 0 0 1 4 4v12a4 4 0 0 1-4 4h-4v6l-7-6H52a4 4 0 0 1-4-4V38a4 4 0 0 1 4-4Z" stroke="currentColor" strokeWidth="1.5" opacity="0.85" />
      <path d="M24 30h24M24 36h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.45" />
      <path d="M58 41h14M58 46h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
    </>
  );
}

function MembersArt() {
  return (
    <>
      <circle cx="36" cy="28" r="9" stroke="currentColor" strokeWidth="1.5" opacity="0.8" />
      <path d="M18 58c1.8-10 8.4-15 18-15s16.2 5 18 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
      <circle cx="62" cy="32" r="7" stroke="currentColor" strokeWidth="1.5" opacity="0.45" />
      <path d="M52 56c1.2-7 5.6-11 12-11 5 0 9 2.6 11 7.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.35" />
    </>
  );
}

function ApprovalsArt() {
  return (
    <>
      <rect x="24" y="12" width="48" height="52" rx="8" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
      <rect x="38" y="8" width="20" height="9" rx="4" stroke="currentColor" strokeWidth="1.5" opacity="0.8" />
      <path d="M34 28h28M34 36h28M34 44h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
      <path d="m55 50 4 4 8-8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
    </>
  );
}

function GenericArt() {
  return (
    <>
      <circle cx="48" cy="34" r="20" stroke="currentColor" strokeWidth="1.5" opacity="0.55" />
      <path d="M34 34h28" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />
      <circle cx="48" cy="58" r="1.6" fill="currentColor" opacity="0.6" />
    </>
  );
}
