import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  AnnouncementModalContent,
  type AnnouncementModalContentProps,
} from "@/components/chat/announcement-modal";

function render(overrides: Partial<AnnouncementModalContentProps> = {}) {
  const props: AnnouncementModalContentProps = {
    text: "第一段内容\n\n第二段内容",
    images: [],
    updatedAt: null,
    unread: false,
    preview: false,
    pending: false,
    onClose: vi.fn(),
    onOpenImage: vi.fn(),
    ...overrides,
  };

  return renderToStaticMarkup(createElement(AnnouncementModalContent, props));
}

describe("AnnouncementModalContent", () => {
  it("renders an unread announcement with the acknowledge action", () => {
    const html = render({ unread: true });

    expect(html).toContain("房间公告");
    expect(html).toContain("新公告");
    expect(html).toContain("我知道了");
    expect(html).toContain("关闭后这条公告会标记为已读");
    expect(html.match(/announcement-modal__paragraph/g)).toHaveLength(2);
  });

  it("renders preview mode without the unread badge", () => {
    const html = render({ preview: true, unread: true });

    expect(html).toContain("公告预览");
    expect(html).toContain("关闭预览");
    expect(html).toContain("这是尚未保存的公告预览");
    expect(html).not.toContain("新公告");
  });

  it("renders the publish time and announcement images", () => {
    const html = render({
      updatedAt: "2026-10-18T10:30:00.000Z",
      images: [
        { imageUrl: "/api/rooms/ABC/announcement/image?index=0", imageName: "a.png" },
        { imageUrl: "/api/rooms/ABC/announcement/image?index=1", imageName: null },
      ],
    });

    expect(html).toContain("更新于");
    expect(html).toContain('data-count="2"');
    expect(html).toContain("2 张图片");
    expect(html).toContain('alt="a.png"');
    expect(html).toContain('alt="公告图片 2"');
  });

  it("exposes a busy disabled action while marking as read", () => {
    const html = render({ unread: true, pending: true });

    expect(html).toContain("正在标记已读…");
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("disabled");
  });

  it("uses a plain close action for already-read announcements", () => {
    const html = render();

    expect(html).toContain("公告由房主发布");
    expect(html).toContain("关闭");
    expect(html).not.toContain("新公告");
  });
});
