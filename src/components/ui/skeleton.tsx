"use client";

import clsx from "clsx";
import type { CSSProperties, HTMLAttributes } from "react";
import { useT } from "@/lib/i18n/context";

export type SkeletonRadius = "sm" | "md" | "lg" | "full";

export type SkeletonProps = HTMLAttributes<HTMLDivElement> & {
  width?: CSSProperties["width"];
  height?: CSSProperties["height"];
  radius?: SkeletonRadius;
};

export function Skeleton({
  className,
  width,
  height,
  radius = "md",
  style,
  ...props
}: SkeletonProps) {
  return (
    <div
      {...props}
      aria-hidden="true"
      data-skeleton="true"
      className={clsx("skeleton", `skeleton--${radius}`, className)}
      style={{ width, height, ...style }}
    />
  );
}

export function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div data-skeleton-text="true" className={clsx("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          height={10}
          width={index === lines - 1 ? "62%" : "100%"}
          radius="full"
        />
      ))}
    </div>
  );
}

export function SkeletonAvatar({
  size = 32,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <Skeleton
      width={size}
      height={size}
      radius="full"
      className={clsx("shrink-0", className)}
    />
  );
}

type SkeletonRowsProps = {
  rows?: number;
  className?: string;
};

export function RoomListSkeleton({ rows = 3, className }: SkeletonRowsProps) {
  const t = useT();

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-skeleton-region="rooms"
      className={clsx("space-y-2", className)}
    >
      <span className="sr-only">{t("loading.rooms")}</span>
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          data-skeleton-row="room"
          className="rounded-lg border border-line-subtle bg-panel/50 px-3 py-2"
        >
          <div className="flex items-center gap-2">
            <Skeleton width={28} height={28} />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton height={10} width="58%" radius="full" />
              <Skeleton height={8} width="38%" radius="full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function MessageListSkeleton({ rows = 5, className }: SkeletonRowsProps) {
  const t = useT();

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-skeleton-region="messages"
      className={className}
    >
      <span className="sr-only">{t("loading.messages")}</span>
      <div className="space-y-4">
        {Array.from({ length: rows }).map((_, index) => {
          const own = index % 2 === 1;

          return (
            <div
              key={index}
              data-skeleton-row="message"
              className={clsx("flex gap-2", own && "flex-row-reverse")}
            >
              <SkeletonAvatar size={28} />
              <div className="min-w-0 max-w-[72%] flex-1 space-y-2">
                <Skeleton
                  height={8}
                  width={own ? "30%" : "24%"}
                  radius="full"
                  className={own ? "ml-auto" : undefined}
                />
                <div
                  className={clsx(
                    "rounded-2xl p-3",
                    own ? "bg-action-soft" : "bg-panel/60",
                  )}
                >
                  <SkeletonText lines={index % 3 === 0 ? 3 : 2} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function MemberListSkeleton({ rows = 5, className }: SkeletonRowsProps) {
  const t = useT();

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-skeleton-region="members"
      className={clsx("space-y-2", className)}
    >
      <span className="sr-only">{t("loading.members")}</span>
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          data-skeleton-row="member"
          className="rounded-lg border border-line-subtle bg-panel/50 px-3 py-2"
        >
          <div className="flex items-center gap-2">
            <SkeletonAvatar size={28} />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton height={10} width="52%" radius="full" />
              <Skeleton height={8} width="34%" radius="full" />
            </div>
            <Skeleton width={28} height={28} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function HomeIdentitySkeleton() {
  const t = useT();

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-skeleton-region="identity"
      className="flex items-center gap-3 rounded-2xl border border-line-subtle bg-panel/80 px-3 py-2"
    >
      <span className="sr-only">{t("loading.identity")}</span>
      <SkeletonAvatar size={40} />
      <div className="w-28 space-y-2">
        <Skeleton height={8} width="60%" radius="full" />
        <Skeleton height={10} width="85%" radius="full" />
      </div>
    </div>
  );
}

export function RoomPageSkeleton() {
  return (
    <main
      data-skeleton-page="room"
      className="grid min-h-[100dvh] w-full grid-cols-1 bg-canvas xl:h-[100dvh] xl:grid-cols-[290px_minmax(0,1fr)_290px] xl:overflow-hidden"
    >
      <aside className="hidden border border-line-subtle bg-canvas p-4 xl:block">
        <div className="mb-4 flex items-center gap-2">
          <Skeleton width={36} height={36} />
          <div className="flex-1 space-y-2">
            <Skeleton height={10} width="60%" radius="full" />
            <Skeleton height={14} width="40%" radius="full" />
          </div>
        </div>
        <RoomListSkeleton rows={4} />
      </aside>

      <section className="order-1 flex min-h-[60vh] flex-col border border-line-subtle bg-canvas xl:order-2 xl:h-full xl:min-h-0">
        <header className="space-y-3 border-b border-line-subtle px-4 py-4">
          <Skeleton height={20} width="42%" radius="full" />
          <Skeleton height={10} width="22%" radius="full" />
        </header>
        <div className="min-h-0 flex-1 px-4 py-4">
          <MessageListSkeleton rows={6} />
        </div>
        <div className="border-t border-line-subtle p-4">
          <Skeleton height={48} width="100%" radius="lg" />
        </div>
      </section>

      <aside className="hidden border border-line-subtle bg-canvas p-4 xl:block">
        <Skeleton height={16} width="50%" radius="full" className="mb-3" />
        <MemberListSkeleton rows={5} />
      </aside>
    </main>
  );
}
