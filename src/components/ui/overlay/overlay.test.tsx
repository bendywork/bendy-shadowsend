import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Drawer } from "@/components/ui/drawer";
import { Modal } from "@/components/ui/modal";
import { Sheet } from "@/components/ui/sheet";

const noop = () => {};

function getBackdrop() {
  return document.querySelector<HTMLElement>("[data-overlay-backdrop]");
}

function getRoots() {
  return Array.from(
    document.querySelectorAll<HTMLElement>("[data-overlay-root]"),
  );
}

describe("overlay surface", () => {
  it("renders an accessible dialog and focuses data-autofocus first", async () => {
    render(
      <Modal open onClose={noop} title="测试标题" description="说明文字">
        <button type="button" data-autofocus>
          确定
        </button>
      </Modal>,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("测试标题");
    expect(dialog).toHaveAccessibleDescription("说明文字");

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "确定" })).toHaveFocus(),
    );
  });

  it("closes on Escape and respects closeOnEsc=false", () => {
    const onClose = vi.fn();
    const { unmount } = render(
      <Modal open onClose={onClose} title="Esc 测试">
        <span>内容</span>
      </Modal>,
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();

    render(
      <Modal open onClose={onClose} title="Esc 禁用" closeOnEsc={false}>
        <span>内容</span>
      </Modal>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on backdrop press unless disabled", () => {
    const onClose = vi.fn();
    const { unmount } = render(
      <Modal open onClose={onClose} title="遮罩测试">
        <span>内容</span>
      </Modal>,
    );

    const backdrop = getBackdrop();
    expect(backdrop).not.toBeNull();
    fireEvent.mouseDown(backdrop as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();

    render(
      <Modal
        open
        onClose={onClose}
        title="遮罩禁用"
        closeOnOverlayClick={false}
      >
        <span>内容</span>
      </Modal>,
    );
    fireEvent.mouseDown(getBackdrop() as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("cycles Tab focus inside the panel", async () => {
    const user = userEvent.setup();
    render(
      <Modal open onClose={noop} title="焦点测试" showClose={false}>
        <button type="button" data-autofocus>
          第一个
        </button>
        <button type="button">第二个</button>
      </Modal>,
    );

    const first = screen.getByRole("button", { name: "第一个" });
    const second = screen.getByRole("button", { name: "第二个" });
    await waitFor(() => expect(first).toHaveFocus());

    await user.tab();
    expect(second).toHaveFocus();

    await user.tab();
    expect(first).toHaveFocus();

    await user.tab({ shift: true });
    expect(second).toHaveFocus();
  });

  it("locks body scroll until the last overlay closes", () => {
    const { rerender } = render(
      <>
        <Modal open onClose={noop} title="第一层">
          <span>一</span>
        </Modal>
        <Modal open onClose={noop} title="第二层">
          <span>二</span>
        </Modal>
      </>,
    );

    expect(document.body.style.overflow).toBe("hidden");

    rerender(
      <>
        <Modal open onClose={noop} title="第一层">
          <span>一</span>
        </Modal>
        <Modal open={false} onClose={noop} title="第二层">
          <span>二</span>
        </Modal>
      </>,
    );
    expect(document.body.style.overflow).toBe("hidden");

    rerender(
      <>
        <Modal open={false} onClose={noop} title="第一层">
          <span>一</span>
        </Modal>
        <Modal open={false} onClose={noop} title="第二层">
          <span>二</span>
        </Modal>
      </>,
    );
    expect(document.body.style.overflow).toBe("");
  });

  it("stacks open overlays by open order", () => {
    render(
      <>
        <Modal open onClose={noop} title="底层">
          <span>一</span>
        </Modal>
        <Modal open onClose={noop} title="顶层">
          <span>二</span>
        </Modal>
      </>,
    );

    const roots = getRoots();
    expect(roots).toHaveLength(2);
    expect(roots[0]?.style.zIndex).toBe("100");
    expect(roots[1]?.style.zIndex).toBe("110");
  });

  it("renders Drawer and Sheet with the expected variant data", () => {
    const { unmount } = render(
      <Drawer open onClose={noop} title="抽屉" side="left">
        <span>抽屉内容</span>
      </Drawer>,
    );
    const drawerPanel = document.querySelector("[data-overlay-panel]");
    expect(drawerPanel).toHaveAttribute("data-kind", "drawer");
    expect(drawerPanel).toHaveAttribute("data-side", "left");
    unmount();

    render(
      <Sheet open onClose={noop} title="动作面板">
        <span>面板内容</span>
      </Sheet>,
    );
    const sheetPanel = document.querySelector("[data-overlay-panel]");
    expect(sheetPanel).toHaveAttribute("data-kind", "sheet");
    expect(sheetPanel).toHaveAttribute("data-side", "bottom");
  });

  it("removes the dialog when open becomes false", () => {
    const { rerender } = render(
      <Modal open onClose={noop} title="关闭测试">
        <span>内容</span>
      </Modal>,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    rerender(
      <Modal open={false} onClose={noop} title="关闭测试">
        <span>内容</span>
      </Modal>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
