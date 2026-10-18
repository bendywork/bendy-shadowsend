import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConfirmDialogContent } from "./confirm-dialog";

const baseProps = {
  title: "移除成员",
  description: "确认将 Alice 移出房间吗？",
  confirmLabel: "确认移除",
  cancelLabel: "取消",
  titleId: "confirm-title",
  descriptionId: "confirm-description",
  onConfirm: () => undefined,
  onCancel: () => undefined,
};

describe("ConfirmDialogContent", () => {
  it("renders an alertdialog with title and description wiring", () => {
    const html = renderToStaticMarkup(
      <ConfirmDialogContent {...baseProps} tone="danger" />,
    );

    expect(html).toContain('role="alertdialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="confirm-title"');
    expect(html).toContain('aria-describedby="confirm-description"');
    expect(html).toContain("移除成员");
    expect(html).toContain("确认将 Alice 移出房间吗？");
    expect(html).toContain("btn-danger");
  });

  it("uses the primary button for non-destructive confirmations", () => {
    const html = renderToStaticMarkup(
      <ConfirmDialogContent {...baseProps} tone="default" />,
    );

    expect(html).toContain("btn-primary");
    expect(html).not.toContain("btn-danger");
  });

  it("disables both actions and exposes aria-busy while pending", () => {
    const html = renderToStaticMarkup(
      <ConfirmDialogContent {...baseProps} busy />,
    );

    expect(html).toContain('aria-busy="true"');
    expect(html.match(/disabled=""/g)).toHaveLength(2);
  });
});
