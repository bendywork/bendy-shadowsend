import { describe, expect, it } from "vitest";
import {
  SANG_ICVE_MAX_BYTES,
  SANG_MEITU_MAX_BYTES,
  SANG_SINGLE_REQUEST_MAX_BYTES,
  getFileExtension,
  isAllowedSangUrl,
  isImageFile,
  isRetryableSangStatus,
  resolveImageMimeType,
  selectSangChannel,
} from "@/lib/upload-rules";

describe("getFileExtension", () => {
  it("extracts lowercase extension from plain and path-like names", () => {
    expect(getFileExtension("photo.PNG")).toBe("png");
    expect(getFileExtension("C:\\tmp\\photo.jpeg")).toBe("jpeg");
    expect(getFileExtension("/tmp/archive.tar.gz")).toBe("gz");
  });

  it("returns empty string for dotfiles and names without extension", () => {
    expect(getFileExtension(".gitignore")).toBe("");
    expect(getFileExtension("README")).toBe("");
    expect(getFileExtension("trailing.")).toBe("");
  });
});

describe("isImageFile", () => {
  it("detects images by mime type or extension", () => {
    expect(isImageFile("file.bin", "image/png")).toBe(true);
    expect(isImageFile("photo.webp", "application/octet-stream")).toBe(true);
    expect(isImageFile("photo.HEIC", "")).toBe(true);
  });

  it("rejects non-image files", () => {
    expect(isImageFile("document.pdf", "application/pdf")).toBe(false);
    expect(isImageFile("archive.zip", "")).toBe(false);
  });
});

describe("resolveImageMimeType", () => {
  it("keeps a provided image mime type", () => {
    expect(resolveImageMimeType("photo.png", "image/png")).toBe("image/png");
  });

  it("derives mime type from the extension when the browser omits it", () => {
    expect(resolveImageMimeType("photo.HEIC", "")).toBe("image/heic");
    expect(resolveImageMimeType("photo.webp", "application/octet-stream")).toBe(
      "image/webp",
    );
    expect(resolveImageMimeType("unknown.bin", "")).toBe(
      "application/octet-stream",
    );
  });
});

describe("selectSangChannel", () => {
  it("selects meitu for supported image formats within 20MB", () => {
    expect(
      selectSangChannel({
        fileName: "photo.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 1024,
      }),
    ).toBe("meitu");

    expect(
      selectSangChannel({
        fileName: "photo.png",
        mimeType: "image/png",
        sizeBytes: SANG_MEITU_MAX_BYTES,
      }),
    ).toBe("meitu");
  });

  it("selects icve for images beyond meitu's 20MB limit", () => {
    expect(
      selectSangChannel({
        fileName: "large.png",
        mimeType: "image/png",
        sizeBytes: SANG_MEITU_MAX_BYTES + 1,
      }),
    ).toBe("icve");
  });

  it("selects icve for non-html files within 100MB", () => {
    expect(
      selectSangChannel({
        fileName: "report.pdf",
        mimeType: "application/pdf",
        sizeBytes: 10 * 1024 * 1024,
      }),
    ).toBe("icve");
  });

  it("rejects html files and files beyond 100MB", () => {
    expect(
      selectSangChannel({
        fileName: "page.html",
        mimeType: "text/html",
        sizeBytes: 1024,
      }),
    ).toBeNull();

    expect(
      selectSangChannel({
        fileName: "large.bin",
        mimeType: "application/octet-stream",
        sizeBytes: SANG_ICVE_MAX_BYTES + 1,
      }),
    ).toBeNull();
  });

  it("rejects empty or invalid sizes", () => {
    expect(
      selectSangChannel({
        fileName: "photo.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 0,
      }),
    ).toBeNull();
    expect(
      selectSangChannel({
        fileName: "photo.jpg",
        mimeType: "image/jpeg",
        sizeBytes: Number.NaN,
      }),
    ).toBeNull();
  });

  it("keeps the Vercel single-request threshold at 4MB", () => {
    expect(SANG_SINGLE_REQUEST_MAX_BYTES).toBe(4 * 1024 * 1024);
  });
});

describe("isAllowedSangUrl", () => {
  it("accepts known file.sang.pub output hosts", () => {
    expect(
      isAllowedSangUrl("https://xiuxiu-pro-new.meitudata.com/posters/a.png"),
    ).toBe(true);
    expect(
      isAllowedSangUrl("https://file.icve.com.cn/file_doc/a.pdf"),
    ).toBe(true);
    expect(isAllowedSangUrl("https://file.sang.pub/a.png")).toBe(true);
  });

  it("rejects arbitrary hosts and non-http schemes", () => {
    expect(isAllowedSangUrl("https://evil.example.com/a.png")).toBe(false);
    expect(isAllowedSangUrl("https://meitudata.com.evil.example/a.png")).toBe(
      false,
    );
    expect(isAllowedSangUrl("javascript:alert(1)")).toBe(false);
    expect(isAllowedSangUrl("not a url")).toBe(false);
  });
});

describe("isRetryableSangStatus", () => {
  it("accepts transient status codes and rejects client errors", () => {
    expect(isRetryableSangStatus(429)).toBe(true);
    expect(isRetryableSangStatus(503)).toBe(true);
    expect(isRetryableSangStatus(524)).toBe(true);
    expect(isRetryableSangStatus(400)).toBe(false);
    expect(isRetryableSangStatus(404)).toBe(false);
  });
});
