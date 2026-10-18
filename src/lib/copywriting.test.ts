import { describe, expect, it } from "vitest";
import { messages } from "@/lib/i18n/messages";
import { auditCopyCatalog, containsEmoji, extractPlaceholders } from "@/lib/copywriting";

describe("copywriting catalog audit", () => {
  it("keeps the shipped zh/en catalog free of copy violations", () => {
    expect(auditCopyCatalog(messages)).toEqual([]);
  });

  it("reports placeholder drift between zh and en", () => {
    const issues = auditCopyCatalog({
      zh: { "toast.example": "移除 {name} 失败" },
      en: { "toast.example": "Failed to remove {item}" },
    });

    expect(issues.map((issue) => issue.rule)).toContain("placeholder-mismatch");
  });

  it("reports emoji and terminal punctuation in toast copy", () => {
    const issues = auditCopyCatalog({
      zh: { "toast.example": "已保存✅。" },
      en: { "toast.example": "Saved ✅." },
    });

    expect(issues.map((issue) => issue.rule)).toEqual(
      expect.arrayContaining(["emoji", "toast-terminal-punctuation"]),
    );
  });
});

describe("copywriting helpers", () => {
  it("detects emoji in copy", () => {
    expect(containsEmoji("已复制✅")).toBe(true);
    expect(containsEmoji("已复制")).toBe(false);
  });

  it("extracts unique placeholders in first-seen order", () => {
    expect(extractPlaceholders("{name} 加入了 {room}，{name} 已就绪")).toEqual([
      "name",
      "room",
    ]);
  });
});
