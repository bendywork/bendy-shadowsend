import { z } from "zod";
import { MAX_AD_CONTENT_CHARS } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

const HEX_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const adItemSchema = z.object({
  content: z.string().trim().min(1).max(MAX_AD_CONTENT_CHARS),
  color: z.string().trim().optional().default("#d4d4d8"),
  url: z.string().trim().optional().default(""),
});

const adItemsSchema = z.array(adItemSchema).min(1).max(30);

export type AdBoardItem = {
  content: string;
  color: string;
  url: string;
};

function normalizeColor(value: string) {
  return HEX_COLOR_RE.test(value) ? value : "#d4d4d8";
}

function normalizeUrl(value: string) {
  if (!value) return "";
  try {
    return new URL(value).toString();
  } catch {
    return "";
  }
}

export function parseAdBoardItems(content: unknown): AdBoardItem[] {
  const parsed = adItemsSchema.safeParse(content);
  if (!parsed.success) {
    return [];
  }

  return parsed.data.map((item) => ({
    content: item.content,
    color: normalizeColor(item.color),
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
