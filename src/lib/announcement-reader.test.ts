import { describe, expect, it } from "vitest";
import {
  formatAnnouncementUpdatedAt,
  splitAnnouncementParagraphs,
} from "@/lib/announcement-reader";

describe("splitAnnouncementParagraphs", () => {
  it("splits on blank lines and trims each paragraph", () => {
    expect(
      splitAnnouncementParagraphs("  第一段  \n\n 第二段\n\n\n第三段 "),
    ).toEqual(["第一段", "第二段", "第三段"]);
  });

  it("normalizes CRLF and keeps single line breaks inside a paragraph", () => {
    expect(splitAnnouncementParagraphs("第一行\r\n第二行\r\n\r\n下一段")).toEqual([
      "第一行\n第二行",
      "下一段",
    ]);
  });

  it("returns an empty list for missing or blank text", () => {
    expect(splitAnnouncementParagraphs(null)).toEqual([]);
    expect(splitAnnouncementParagraphs(undefined)).toEqual([]);
    expect(splitAnnouncementParagraphs(" \n\n ")).toEqual([]);
  });
});

describe("formatAnnouncementUpdatedAt", () => {
  it("formats a valid timestamp for both locales", () => {
    const iso = "2026-10-18T10:30:00.000Z";

    expect(formatAnnouncementUpdatedAt(iso, "zh")).toContain("2026");
    expect(formatAnnouncementUpdatedAt(iso, "en")).toContain("2026");
  });

  it("returns null for missing or invalid timestamps", () => {
    expect(formatAnnouncementUpdatedAt(null, "zh")).toBeNull();
    expect(formatAnnouncementUpdatedAt("not-a-date", "zh")).toBeNull();
  });
});
