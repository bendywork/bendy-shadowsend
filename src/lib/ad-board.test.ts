import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { parseAdBoardItems } from "@/lib/ad-board";

describe("ad board parsing (dc-02)", () => {
  it("parses content and URL without a color field", () => {
    const items = parseAdBoardItems([
      { content: "公告一", url: "https://example.com/a" },
    ]);

    expect(items).toEqual([
      { content: "公告一", url: "https://example.com/a" },
    ]);
    expect(items[0]).not.toHaveProperty("color");
  });

  it("strips legacy color fields so stored accents cannot reach the UI", () => {
    const items = parseAdBoardItems([
      { content: "旧广告", color: "#0a84ff", url: "" },
      { content: "另一条", color: "#ff0000", url: "https://example.com" },
    ]);

    expect(items).toEqual([
      { content: "旧广告", url: "" },
      { content: "另一条", url: "https://example.com/" },
    ]);
    for (const item of items) {
      expect(item).not.toHaveProperty("color");
    }
  });

  it("drops invalid items and invalid URLs", () => {
    expect(parseAdBoardItems([{ content: "" }])).toEqual([]);
    expect(parseAdBoardItems("not-an-array")).toEqual([]);
    expect(parseAdBoardItems([{ content: "ok", url: "javascript:alert(1)" }])).toEqual([
      { content: "ok", url: "" },
    ]);
  });

  it("accepts up to 30 items and rejects more", () => {
    const thirty = Array.from({ length: 30 }, (_, index) => ({ content: `ad-${index}` }));
    expect(parseAdBoardItems(thirty)).toHaveLength(30);
    expect(parseAdBoardItems([...thirty, { content: "overflow" }])).toEqual([]);
  });
});
