"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Pause, Play } from "lucide-react";
import {
  AD_CAROUSEL_INTERVAL_MS,
  AD_CAROUSEL_SLIDE_MS,
  getAdSlide,
  getNextAdIndex,
  normalizeAdItems,
  shouldAutoAdvance,
} from "@/lib/ad-carousel";
import { useT } from "@/lib/i18n/context";
import type { AdBoardItem } from "@/types/chat";

type AdCarouselContentProps = {
  items: AdBoardItem[];
  index: number;
  animating: boolean;
  paused: boolean;
  label: string;
  regionLabel: string;
  pauseLabel: string;
  resumeLabel: string;
  onTogglePause: () => void;
  className?: string;
};

function AdCarouselItem({
  item,
  className,
  hidden = false,
}: {
  item: AdBoardItem;
  className: string;
  hidden?: boolean;
}) {
  const shared = clsx(
    "absolute inset-0 flex items-center text-xs leading-5 text-ink-muted",
    "transition-transform duration-slow ease-out motion-reduce:transition-none",
    className,
  );

  if (item.url) {
    return (
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className={clsx(shared, "hover:text-ink focus-visible:text-ink")}
        title={item.content}
        tabIndex={hidden ? -1 : undefined}
        aria-hidden={hidden || undefined}
      >
        <span className="truncate">{item.content}</span>
      </a>
    );
  }

  return (
    <div className={shared} title={item.content} aria-hidden={hidden || undefined}>
      <span className="truncate">{item.content}</span>
    </div>
  );
}

/** Presentational ticker, kept hook-free so it can be server-rendered in tests. */
export function AdCarouselContent({
  items,
  index,
  animating,
  paused,
  label,
  regionLabel,
  pauseLabel,
  resumeLabel,
  onTogglePause,
  className,
}: AdCarouselContentProps) {
  const { current, next } = getAdSlide(items, index);
  if (!current) return null;

  const canPause = items.length > 1;

  return (
    <div
      className={clsx("flex min-w-0 items-center gap-2", className)}
      role="region"
      aria-roledescription="carousel"
      aria-label={regionLabel}
      aria-live="off"
    >
      <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.18em] text-ink-faint">
        {label}
      </span>
      <span aria-hidden="true" className="h-3 w-px shrink-0 bg-line-subtle" />
      <div className="relative h-5 min-w-0 flex-1 overflow-hidden">
        <AdCarouselItem
          item={current}
          className={animating ? "-translate-y-full" : "translate-y-0"}
        />
        {next ? (
          <AdCarouselItem
            item={next}
            hidden
            className={animating ? "translate-y-0" : "translate-y-full"}
          />
        ) : null}
      </div>
      {canPause ? (
        <button
          type="button"
          onClick={onTogglePause}
          aria-label={paused ? resumeLabel : pauseLabel}
          aria-pressed={paused}
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-ink-faint transition-ui hover:text-ink-soft focus-visible:text-ink-soft"
        >
          {paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
        </button>
      ) : null}
    </div>
  );
}

/**
 * Room-header ad ticker. Visual noise is intentionally low: one monochrome
 * line inside the header, no card border, no per-ad colors. Rotation pauses
 * on hover/focus and can be paused explicitly with the small toggle.
 */
export function AdCarousel({
  items,
  className,
}: {
  items: AdBoardItem[];
  className?: string;
}) {
  const t = useT();
  const normalized = useMemo(() => normalizeAdItems(items), [items]);
  const [index, setIndex] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [hoverPaused, setHoverPaused] = useState(false);
  const [manualPaused, setManualPaused] = useState(false);

  const paused = hoverPaused || manualPaused;
  const canAnimate = animating && normalized.length > 1;

  useEffect(() => {
    if (!shouldAutoAdvance(normalized.length, paused)) return;
    const timer = window.setInterval(() => setAnimating(true), AD_CAROUSEL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [normalized.length, paused]);

  useEffect(() => {
    if (!animating || normalized.length <= 1) return;
    const timer = window.setTimeout(() => {
      setIndex((prev) => getNextAdIndex(prev, normalized.length));
      setAnimating(false);
    }, AD_CAROUSEL_SLIDE_MS);
    return () => window.clearTimeout(timer);
  }, [animating, normalized.length]);

  return (
    <div
      className={clsx("min-w-0", className)}
      onMouseEnter={() => setHoverPaused(true)}
      onMouseLeave={() => setHoverPaused(false)}
      onFocusCapture={() => setHoverPaused(true)}
      onBlurCapture={() => setHoverPaused(false)}
    >
      <AdCarouselContent
        items={normalized}
        index={index}
        animating={canAnimate}
        paused={manualPaused}
        label={t("ad.label")}
        regionLabel={t("ad.region")}
        pauseLabel={t("ad.pause")}
        resumeLabel={t("ad.resume")}
        onTogglePause={() => setManualPaused((prev) => !prev)}
      />
    </div>
  );
}
