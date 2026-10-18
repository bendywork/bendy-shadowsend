import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ImageViewer } from "./image-viewer";
import type { ImageViewerItem } from "@/lib/image-viewer";

const items: ImageViewerItem[] = [
  { id: "one", src: "/one.png", fileName: "one.png" },
  { id: "two", src: "/two.png", fileName: "two.png" },
  { id: "three", src: "/three.png", fileName: "three.png" },
];

function renderViewer(
  overrides: Partial<{
    items: ImageViewerItem[];
    index: number;
    onIndexChange: (index: number) => void;
    onClose: () => void;
    onError: (message: string) => void;
  }> = {},
) {
  return render(
    <ImageViewer
      items={items}
      index={0}
      onIndexChange={vi.fn()}
      onClose={vi.fn()}
      {...overrides}
    />,
  );
}

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

describe("ImageViewer", () => {
  it("renders the active image, counter, thumbnails and controls", async () => {
    renderViewer();

    expect(await screen.findByRole("dialog", { name: "图片查看器" })).toBeInTheDocument();
    expect(screen.getByText("one.png")).toBeInTheDocument();
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "图片预览：one.png" })).toHaveAttribute(
      "src",
      "/one.png",
    );
    expect(screen.getByRole("tab", { name: "第 1 张：one.png" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("switches images through buttons, thumbnails and arrow keys", async () => {
    const onIndexChange = vi.fn();
    renderViewer({ onIndexChange });

    fireEvent.click(await screen.findByRole("button", { name: "下一张" }));
    expect(onIndexChange).toHaveBeenLastCalledWith(1);

    fireEvent.click(screen.getByRole("tab", { name: "第 3 张：three.png" }));
    expect(onIndexChange).toHaveBeenLastCalledWith(2);

    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(onIndexChange).toHaveBeenLastCalledWith(2);

    fireEvent.keyDown(window, { key: "End" });
    expect(onIndexChange).toHaveBeenLastCalledWith(2);

    fireEvent.keyDown(window, { key: "Home" });
    expect(onIndexChange).toHaveBeenLastCalledWith(0);
  });

  it("closes with Escape and the close button", async () => {
    const onClose = vi.fn();
    renderViewer({ onClose });

    await screen.findByRole("dialog");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("zooms with buttons and keyboard, then resets", async () => {
    renderViewer();

    fireEvent.click(await screen.findByRole("button", { name: "放大" }));
    expect(screen.getByText("125%")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "+" });
    expect(screen.getByText("150%")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "重置缩放" }));
    expect(screen.getByText("100%")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "-" });
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("runs the download handler and reports failures", async () => {
    const onDownload = vi.fn().mockResolvedValue(undefined);
    const onError = vi.fn();
    renderViewer({
      items: [{ ...items[0], onDownload }],
      onError,
    });

    fireEvent.click(await screen.findByRole("button", { name: "下载图片" }));
    await waitFor(() => expect(onDownload).toHaveBeenCalledTimes(1));

    onDownload.mockRejectedValueOnce(new Error("network down"));
    fireEvent.click(screen.getByRole("button", { name: "下载图片" }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith("network down"));
    expect(screen.getByRole("alert")).toHaveTextContent("network down");
  });

  it("shows a retry state when the image fails to load", async () => {
    renderViewer();

    fireEvent.error(await screen.findByRole("img", { name: "图片预览：one.png" }));
    expect(screen.getByRole("alert")).toHaveTextContent("图片加载失败");

    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(screen.getByRole("img", { name: "图片预览：one.png" })).toBeInTheDocument();
  });

  it("locks body scrolling and moves focus into the dialog", async () => {
    renderViewer();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "关闭" })).toHaveFocus(),
    );
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("hides navigation for a single image", async () => {
    renderViewer({ items: [items[0]] });

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "下一张" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.getByText("1 / 1")).toBeInTheDocument();
  });
});
