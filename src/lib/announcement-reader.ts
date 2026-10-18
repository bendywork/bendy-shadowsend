import type { Lang } from "@/lib/i18n/messages";

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(lang: Lang): Intl.DateTimeFormat {
  const locale = lang === "en" ? "en-US" : "zh-CN";
  const cached = formatterCache.get(locale);
  if (cached) return cached;

  const formatter = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  formatterCache.set(locale, formatter);
  return formatter;
}

/**
 * Formats the announcement publish time for the reader meta line.
 * Returns null for missing or malformed timestamps so the UI can omit the line.
 */
export function formatAnnouncementUpdatedAt(
  iso: string | null | undefined,
  lang: Lang,
): string | null {
  if (!iso) return null;

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  return getFormatter(lang).format(date);
}

/**
 * Splits announcement copy into readable paragraphs on blank lines.
 * Single line breaks stay inside a paragraph and are preserved by `pre-wrap`.
 */
export function splitAnnouncementParagraphs(
  text: string | null | undefined,
): string[] {
  if (!text) return [];

  return text
    .replace(/\r\n?/g, "\n")
    .trim()
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}
