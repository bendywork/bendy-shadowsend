"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import {
  AD_CAROUSEL_INTERVAL_MS,
  AD_CAROUSEL_SLIDE_MS,
  HEX_COLOR_RE,
} from "@/lib/room-page";
import type { AdBoardItem } from "@/types/chat";

function AdCarouselItem({
  item,
  className,
}: {
  item: AdBoardItem;
  className: string;
}) {
  const textColor = HEX_COLOR_RE.test(item.color)
    ? item.color
    : "var(--ds-ink-soft)";

  if (item.url) {
    return (
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className={clsx(
          "absolute inset-0 flex items-center px-3 text-sm transition-transform duration-slow ease-out",
          className,
        )}
        style={{ color: textColor }}
        title={item.content}
      >
        <span className="truncate">{item.content}</span>
      </a>
    );
  }

  return (
    <div
      className={clsx(
        "absolute inset-0 flex items-center px-3 text-sm transition-transform duration-slow ease-out",
        className,
      )}
      style={{ color: textColor }}
      title={item.content}
    >
      <span className="truncate">{item.content}</span>
    </div>
  );
}

export function AdCarousel({ items }: { items: AdBoardItem[] }) {
  const [index, setIndex] = useState(0);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    if (items.length <= 1) return;
    const timer = window.setInterval(() => {
      setAnimating(true);
    }, AD_CAROUSEL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [items.length]);

  useEffect(() => {
    if (!animating || items.length <= 1) return;
    const timer = window.setTimeout(() => {
      setIndex((prev) => (prev + 1) % items.length);
      setAnimating(false);
    }, AD_CAROUSEL_SLIDE_MS);
    return () => window.clearTimeout(timer);
  }, [animating, items.length]);

  if (items.length === 0) {
    return null;
  }

  const safeIndex = index % items.length;
  const current = items[safeIndex];
  const next = items[(safeIndex + 1) % items.length];

  return (
    <div className="relative h-9 overflow-hidden rounded-lg border border-line bg-panel/70">
      <AdCarouselItem
        item={current}
        className={animating ? "-translate-y-full" : "translate-y-0"}
      />
      {items.length > 1 ? (
        <AdCarouselItem
          item={next}
          className={animating ? "translate-y-0" : "translate-y-full"}
        />
      ) : null}
    </div>
  );
}
