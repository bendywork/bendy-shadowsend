"use client";

import { useT } from "@/lib/i18n/context";

/** First focusable element on every page (WCAG 2.4.1 Bypass Blocks). */
export function SkipLink({ targetId = "main-content" }: { targetId?: string }) {
  const t = useT();

  return (
    <a href={`#${targetId}`} className="skip-link">
      {t("a11y.skipToContent")}
    </a>
  );
}
