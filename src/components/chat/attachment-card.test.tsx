import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  AttachmentCard,
  type AttachmentCardData,
} from "./attachment-card";

const baseAttachment: AttachmentCardData = {
  id: "att-1",
  fileName: "spec.pdf",
  mimeType: "application/pdf",
  sizeBytes: 2048,
  previewType: "NONE",
};

function renderCard(
  attachment: Partial<AttachmentCardData> = {},
  props: Partial<ComponentProps<typeof AttachmentCard>> = {},
) {
  return render(
    <AttachmentCard attachment={{ ...baseAttachment, ...attachment }} {...props} />,
  );
}

afterEach(() => {
  cleanup();
});

describe("AttachmentCard", () => {
  it("renders the file name, type label, size and download action", () => {
    renderCard({}, { onDownload: vi.fn() });

    expect(screen.getByText("spec.pdf")).toBeInTheDocument();
    expect(screen.getByText("PDF")).toBeInTheDocument();
    expect(screen.getByText("2.0 KB")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "下载" })).toBeInTheDocument();
  });

  it("calls onDownload when the download action is pressed", async () => {
    const onDownload = vi.fn().mockResolvedValue(undefined);
    renderCard({}, { onDownload });

    fireEvent.click(screen.getByRole("button", { name: "下载" }));

    await waitFor(() => expect(onDownload).toHaveBeenCalledTimes(1));
  });

  it("shows upload progress and hides ready-only actions while uploading", () => {
    renderCard(
      { fileName: "clip.mp4", mimeType: "video/mp4", sizeBytes: 5 * 1024 * 1024 },
      { status: "uploading", progress: 42, onDownload: vi.fn() },
    );

    const progressbar = screen.getByRole("progressbar", { name: "上传进度" });
    expect(progressbar).toHaveAttribute("aria-valuenow", "42");
    expect(progressbar).toHaveAttribute("aria-valuemin", "0");
    expect(progressbar).toHaveAttribute("aria-valuemax", "100");
    expect(screen.getByText("上传中 42%")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "下载" })).not.toBeInTheDocument();
  });

  it("clamps out-of-range progress values", () => {
    renderCard({}, { status: "uploading", progress: 140 });

    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "100",
    );
    expect(screen.getByText("上传中 100%")).toBeInTheDocument();
  });

  it("shows the failure message and retries the upload", () => {
    const onRetry = vi.fn();
    renderCard(
      {},
      {
        status: "failed",
        errorMessage: "网络异常，上传中断",
        onRetry,
      },
    );

    expect(screen.getByRole("alert")).toHaveTextContent("网络异常，上传中断");
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("falls back to the default upload failure copy", () => {
    renderCard({}, { status: "failed" });

    expect(screen.getByRole("alert")).toHaveTextContent("上传失败");
  });

  it("opens the image preview from the media area and the action button", () => {
    const onPreview = vi.fn();
    renderCard(
      {
        fileName: "photo.png",
        mimeType: "image/png",
        previewType: "IMAGE",
        previewUrl: "https://example.com/photo.png",
      },
      { onPreview },
    );

    expect(screen.getByAltText("图片预览：photo.png")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "预览: photo.png" }));
    fireEvent.click(screen.getByRole("button", { name: "预览" }));

    expect(onPreview).toHaveBeenCalledTimes(2);
  });

  it("replaces a broken image preview with a failure fallback", () => {
    renderCard(
      {
        fileName: "photo.png",
        mimeType: "image/png",
        previewType: "IMAGE",
        previewUrl: "https://example.com/broken.png",
      },
      { onPreview: vi.fn() },
    );

    fireEvent.error(screen.getByAltText("图片预览：photo.png"));

    expect(screen.getByText("预览加载失败")).toBeInTheDocument();
    expect(
      screen.queryByAltText("图片预览：photo.png"),
    ).not.toBeInTheDocument();
  });

  it("shows an inline error and notifies the caller when download fails", async () => {
    const onError = vi.fn();
    const onDownload = vi.fn().mockRejectedValue(new Error("下载服务不可用"));
    renderCard({}, { onDownload, onError });

    fireEvent.click(screen.getByRole("button", { name: "下载" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("下载服务不可用"),
    );
    expect(onError).toHaveBeenCalledWith("下载服务不可用");
  });
});
