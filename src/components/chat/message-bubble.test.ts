import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  MessageBubble,
  type BubbleAttachment,
  type MessageBubbleStatus,
} from "@/components/chat/message-bubble";
import type { ClientUser } from "@/types/chat";
import type { MessageGroupPosition } from "@/lib/message-bubble";

const sender: ClientUser = {
  id: "user-1",
  nickname: "小笨",
  avatarInitial: "笨",
  avatarColor: "#111111",
};

type Overrides = {
  own?: boolean;
  status?: MessageBubbleStatus;
  groupPosition?: MessageGroupPosition;
  content?: string;
  visibleContent?: string;
  progress?: number;
  error?: string | null;
  attachments?: BubbleAttachment[];
  copied?: boolean;
  canToggleExpand?: boolean;
  onRetry?: () => void;
};

function render(overrides: Overrides = {}) {
  return renderToStaticMarkup(
    createElement(MessageBubble, {
      own: overrides.own ?? false,
      sender,
      createdAt: "2026-10-18T10:00:00.000Z",
      status: overrides.status ?? "received",
      progress: overrides.progress,
      error: overrides.error,
      groupPosition: overrides.groupPosition ?? "single",
      content: overrides.content ?? "你好",
      visibleContent: overrides.visibleContent ?? overrides.content ?? "你好",
      collapsed: false,
      canToggleExpand: overrides.canToggleExpand ?? false,
      onToggleExpand: vi.fn(),
      onCopy: vi.fn(),
      copied: overrides.copied ?? false,
      attachments: overrides.attachments ?? [],
      onOpenImage: vi.fn(),
      onRetry: overrides.onRetry,
    }),
  );
}

describe("MessageBubble", () => {
  it("marks own and received rows for layout", () => {
    expect(render({ own: true, status: "sent" })).toContain('data-own="true"');
    expect(render({ own: false })).toContain('data-own="false"');
  });

  it("shows the sender identity only at the start of a group", () => {
    const first = render({ groupPosition: "first" });
    const middle = render({ groupPosition: "middle" });

    expect(first).toContain("小笨");
    expect(first).toContain("message-avatar");
    expect(middle).not.toContain("小笨");
    expect(middle).toContain("message-avatar-spacer");
  });

  it("keeps time and receipts on the group's last bubble", () => {
    const first = render({ own: true, status: "read", groupPosition: "first" });
    const last = render({ own: true, status: "read", groupPosition: "last" });

    expect(first).not.toContain("message-meta");
    expect(first).not.toContain("已读");
    expect(last).toContain("message-meta");
    expect(last).toContain("已读");
  });

  it("always exposes sending state inside a group", () => {
    const html = render({
      own: true,
      status: "sending",
      progress: 12,
      groupPosition: "middle",
    });

    expect(html).toContain("message-meta");
    expect(html).toContain("发送中");
  });

  it("shows sent and read receipts with distinct status classes", () => {
    const sent = render({ own: true, status: "sent" });
    const read = render({ own: true, status: "read" });

    expect(sent).toContain("已发送");
    expect(sent).not.toContain("message-status--read");
    expect(read).toContain("已读");
    expect(read).toContain("message-status--read");
  });

  it("exposes sending progress as a status line and a bar", () => {
    const html = render({ own: true, status: "sending", progress: 40 });

    expect(html).toContain('role="status"');
    expect(html).toContain("发送中");
    expect(html).toContain("40%");
    expect(html).toContain("scaleX(0.4)");
  });

  it("renders failed messages as an alert with retry", () => {
    const html = render({
      own: true,
      status: "failed",
      error: "网络异常",
      onRetry: vi.fn(),
    });

    expect(html).toContain('role="alert"');
    expect(html).toContain("网络异常");
    expect(html).toContain("重试");
    expect(html).toContain("message-status--failed");
  });

  it("renders attachments with name, type and size", () => {
    const html = render({
      attachments: [
        {
          id: "a1",
          fileName: "notes.txt",
          mimeType: "text/plain",
          sizeBytes: 2048,
          previewType: "NONE",
        },
      ],
    });

    expect(html).toContain("notes.txt");
    expect(html).toContain("text/plain");
    expect(html).toContain("2.0 KB");
  });

  it("offers copy and expand actions for text messages", () => {
    const html = render({ canToggleExpand: true, content: "长文" });

    expect(html).toContain("复制文本");
    expect(html).toContain("收起");
  });

  it("omits the copy block for attachment-only messages", () => {
    const html = render({
      content: "",
      attachments: [
        {
          id: "a1",
          fileName: "photo.png",
          mimeType: "image/png",
          sizeBytes: 1024,
          previewType: "IMAGE",
          previewUrl: "https://example.com/photo.png",
        },
      ],
    });

    expect(html).not.toContain("复制文本");
    expect(html).toContain("photo.png");
  });
});
