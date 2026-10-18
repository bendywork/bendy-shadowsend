import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialogContent } from "@/components/ui/confirm-dialog";

function render(overrides: Partial<Parameters<typeof ConfirmDialogContent>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(ConfirmDialogContent, {
      title: "移除成员？",
      description: "将「小明」移出房间后，对方将立即失去访问权限。",
      confirmLabel: "移出房间",
      cancelLabel: "取消",
      eyebrow: "危险操作",
      pendingLabel: "正在移出…",
      onConfirm: vi.fn(),
      onCancel: vi.fn(),
      ...overrides,
    }),
  );
}

describe("ConfirmDialogContent", () => {
  it("renders a modal alertdialog with title, description and danger eyebrow", () => {
    const html = render();

    expect(html).toContain('role="alertdialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("危险操作");
    expect(html).toContain("移除成员？");
    expect(html).toContain("将「小明」移出房间后");
  });

  it("renders cancel before the destructive action", () => {
    const html = render();
    const cancelIndex = html.indexOf("btn-secondary");
    const confirmIndex = html.indexOf("btn-danger");

    expect(cancelIndex).toBeGreaterThan(-1);
    expect(confirmIndex).toBeGreaterThan(cancelIndex);
  });

  it("shows the pending label and disables both actions while submitting", () => {
    const html = render({ pending: true });

    expect(html).toContain("正在移出…");
    expect(html).toContain('aria-busy="true"');
    expect(html.match(/disabled=""/g)?.length).toBe(2);
  });

  it("uses dialog semantics for non-danger confirmations", () => {
    const html = render({ tone: "default", eyebrow: undefined });

    expect(html).toContain('role="dialog"');
    expect(html).toContain("confirm-dialog__panel--default");
    expect(html).not.toContain('role="alertdialog"');
  });
});
