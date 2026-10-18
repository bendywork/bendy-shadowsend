import { describe, expect, it } from "vitest";
import { messages, type MessageKey } from "@/lib/i18n/messages";
import {
  getDangerActionKey,
  getDangerConfirmCopy,
  type DangerActionKind,
} from "@/lib/confirm-dialog";

function translator(lang: "zh" | "en") {
  const table = messages[lang] as Record<MessageKey, string>;
  return (key: MessageKey, params?: Record<string, string | number>) => {
    let out = table[key] ?? key;
    if (params) {
      for (const [name, value] of Object.entries(params)) {
        out = out.replace(new RegExp(`\\{${name}\\}`, "g"), String(value));
      }
    }
    return out;
  };
}

const KINDS: DangerActionKind[] = ["kick", "transfer", "leave", "dissolve"];

describe("getDangerConfirmCopy", () => {
  it("uses the shared danger eyebrow and cancel label", () => {
    const copy = getDangerConfirmCopy("kick", "小明", translator("zh"));

    expect(copy.eyebrow).toBe("危险操作");
    expect(copy.cancelLabel).toBe("取消");
  });

  it("interpolates the member name for kick", () => {
    const copy = getDangerConfirmCopy("kick", "小明", translator("zh"));

    expect(copy.title).toBe("移除成员？");
    expect(copy.description).toContain("「小明」");
    expect(copy.description).not.toContain("{name}");
    expect(copy.confirmLabel).toBe("移出房间");
    expect(copy.pendingLabel).toBe("正在移出…");
  });

  it("interpolates the member name for ownership transfer", () => {
    const copy = getDangerConfirmCopy("transfer", "Alice", translator("zh"));

    expect(copy.title).toBe("转让房主？");
    expect(copy.description).toContain("「Alice」");
    expect(copy.description).toContain("无法撤销");
    expect(copy.confirmLabel).toBe("转让房主");
  });

  it("interpolates the room name for leaving", () => {
    const copy = getDangerConfirmCopy("leave", "项目讨论", translator("zh"));

    expect(copy.title).toBe("退出房间？");
    expect(copy.description).toContain("「项目讨论」");
    expect(copy.confirmLabel).toBe("退出房间");
  });

  it("keeps dissolve copy free of a subject placeholder", () => {
    const copy = getDangerConfirmCopy("dissolve", null, translator("zh"));

    expect(copy.title).toBe("解散房间？");
    expect(copy.description).toBe("解散后所有成员将立即退出，房间内容无法恢复。");
    expect(copy.confirmLabel).toBe("解散房间");
    expect(copy.pendingLabel).toBe("正在解散…");
  });

  it("provides complete English copy with the same contract", () => {
    const copy = getDangerConfirmCopy("transfer", "Alice", translator("en"));

    expect(copy.eyebrow).toBe("Danger");
    expect(copy.cancelLabel).toBe("Cancel");
    expect(copy.title).toBe("Transfer ownership?");
    expect(copy.description).toContain("“Alice”");
    expect(copy.description).toContain("cannot be undone");
    expect(copy.pendingLabel).toBe("Transferring…");
  });

  it("gives every danger action a distinct title and confirm label", () => {
    const t = translator("zh");
    const titles = KINDS.map((kind) => getDangerConfirmCopy(kind, "X", t).title);
    const actions = KINDS.map(
      (kind) => getDangerConfirmCopy(kind, "X", t).confirmLabel,
    );

    expect(new Set(titles).size).toBe(KINDS.length);
    expect(new Set(actions).size).toBe(KINDS.length);
  });
});

describe("getDangerActionKey", () => {
  it("matches the page action keys for member targets", () => {
    expect(getDangerActionKey("kick", "member-1")).toBe("kick-member-1");
    expect(getDangerActionKey("transfer", "member-1")).toBe("transfer-member-1");
  });

  it("matches the page action keys for room targets", () => {
    expect(getDangerActionKey("leave", "ROOM01")).toBe("leave-ROOM01");
    expect(getDangerActionKey("dissolve")).toBe("dissolve");
  });
});
