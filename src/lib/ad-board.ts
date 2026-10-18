import { z } from "zod";
import { MAX_AD_CONTENT_CHARS } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

const adItemSchema = z.object({
  content: z.string().trim().min(1).max(MAX_AD_CONTENT_CHARS),
  url: z.string().trim().optional().default(""),
});

const adItemsSchema = z.array(adItemSchema).min(1).max(30);

export type AdBoardItem = {
  content: string;
  url: string;
};

function normalizeUrl(value: string) {
  if (!value) return "";
  try {
    const url = new URL(value);
    // Ads are rendered as links, so only web protocols are safe to keep.
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.toString();
  } catch {
    return "";
  }
}

export function parseAdBoardItems(content: unknown): AdBoardItem[] {
  const parsed = adItemsSchema.safeParse(content);
  if (!parsed.success) {
    return [];
  }

  // Legacy ad records may still contain a `color` field. Zod strips unknown
  // keys and the renderer always uses the theme ink token, so stored colours
  // can never re-introduce a coloured accent (dc-02).
  return parsed.data.map((item) => ({
    content: item.content,
    url: normalizeUrl(item.url),
  }));
}

export async function getActiveAdBoardItems(now = new Date()) {
  const rows = await prisma.advertisement.findMany({
    where: {
      startsAt: { lte: now },
      endsAt: { gte: now },
    },
    select: {
      content: true,
      startsAt: true,
    },
    orderBy: [{ startsAt: "asc" }],
  });

  return rows.flatMap((row) => parseAdBoardItems(row.content));
}
