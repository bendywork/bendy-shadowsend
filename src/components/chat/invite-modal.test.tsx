import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/lib/i18n/context";
import {
  InviteModalContent,
  type InviteModalContentProps,
} from "@/components/chat/invite-modal";

const NOW = new Date(2026, 9, 18, 14, 30, 0).getTime();
const LINK = "https://shadowsend.example/?room=ABC123&invite=token";

function render(overrides: Partial<InviteModalContentProps> = {}): string {
  const props: InviteModalContentProps = {
    roomName: "深夜书房",
    roomCode: "ABC123",
    inviteLink: LINK,
    expiresAt: new Date(NOW + 10 * 60_000).toISOString(),
    qrDataUrl: "data:image/png;base64,abc",
    qrLoading: false,
    loading: false,
    error: null,
    copied: false,
    now: NOW,
    onCopy: vi.fn(),
    onRegenerate: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };

  return renderToStaticMarkup(
    <LanguageProvider>
      <InviteModalContent {...props} />
    </LanguageProvider>,
  );
}

describe("InviteModalContent", () => {
  it("shows a generating state while the link is being minted", () => {
    const html = render({
      inviteLink: "",
      expiresAt: null,
      qrDataUrl: null,
      loading: true,
    });

    expect(html).toContain("正在生成邀请链接…");
    expect(html).toContain("正在生成二维码…");
    expect(html).toContain("正在生成");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>[\s\S]*?复制链接/);
  });

  it("renders the QR code, link, countdown and validity facts", () => {
    const html = render();

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("深夜书房");
    expect(html).toContain("data:image/png;base64,abc");
    expect(html).toContain(`value="${LINK.replace("&", "&amp;")}"`);
    expect(html).toContain("链接有效");
    expect(html).toContain("10:00");
    expect(html).toContain("15 分钟 · 一次性");
    expect(html).toContain("扫码或复制链接");
    expect(html).not.toMatch(/<button[^>]*disabled[^>]*>[\s\S]*?复制链接/);
  });

  it("switches to the expiring tone during the final minute", () => {
    const html = render({
      expiresAt: new Date(NOW + 30_000).toISOString(),
    });

    expect(html).toContain("即将过期");
    expect(html).toContain("00:30");
  });

  it("marks an expired link as unusable", () => {
    const html = render({
      expiresAt: new Date(NOW - 1_000).toISOString(),
    });

    expect(html).toContain("链接已过期");
    expect(html).toContain("此链接已失效，请重新生成一条。");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>[\s\S]*?复制链接/);
  });

  it("surfaces generation failures with a retry action", () => {
    const html = render({
      inviteLink: "",
      expiresAt: null,
      qrDataUrl: null,
      error: "网络异常，请检查网络后重试",
    });

    expect(html).toContain("生成失败");
    expect(html).toContain("网络异常，请检查网络后重试");
    expect(html).toContain("重试");
    expect(html).toContain("邀请链接生成失败");
  });

  it("confirms a successful copy in the button and live region", () => {
    const html = render({ copied: true });

    expect(html).toContain("已复制");
    expect(html).toContain("链接已复制，快去分享吧。");
    expect(html).toContain('data-copied="true"');
  });
});
