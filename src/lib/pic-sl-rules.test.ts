import { describe, expect, it } from "vitest";
import {
  buildPicSlRemoteFileName,
  getFileExtension,
  isPicSlSupportedFileName,
  normalizePicSlMimeType,
  normalizePicSlPublicUrl,
  PIC_SL_ALLOWED_EXTENSIONS,
} from "@/lib/pic-sl-rules";

describe("pic-sl-rules", () => {
  it("keeps the 58-extension whitelist from pic.sl.al", () => {
    expect(PIC_SL_ALLOWED_EXTENSIONS).toHaveLength(58);
    expect(new Set(PIC_SL_ALLOWED_EXTENSIONS).size).toBe(58);
  });

  it("checks extensions case-insensitively", () => {
    expect(isPicSlSupportedFileName("report.PDF")).toBe(true);
    expect(isPicSlSupportedFileName("archive.tar.gz")).toBe(true);
    expect(isPicSlSupportedFileName("payload.exe")).toBe(false);
    expect(isPicSlSupportedFileName("script.js")).toBe(false);
    expect(isPicSlSupportedFileName("README")).toBe(false);
    expect(isPicSlSupportedFileName(".bashrc")).toBe(false);
  });

  it("extracts only the final extension", () => {
    expect(getFileExtension("archive.tar.gz")).toBe(".gz");
    expect(getFileExtension("no-extension")).toBe("");
    expect(getFileExtension("dir/file.TXT")).toBe(".txt");
  });

  it("builds an ASCII-safe remote filename and keeps the extension", () => {
    const remoteName = buildPicSlRemoteFileName(
      "中文 报告 v2.PDF",
      1_700_000_000_000,
      () => 0.5,
    );

    expect(remoteName).toMatch(/^[\x20-\x7E]+\.pdf$/);
    expect(remoteName.endsWith(".pdf")).toBe(true);
    expect(remoteName).not.toMatch(/[^\x20-\x7E]/);
  });

  it("accepts only official pic.sl.al file URLs", () => {
    expect(
      normalizePicSlPublicUrl(
        "https://pic.sl.al/f/pic/2026-10-18/fileid_abc_report.pdf",
      ),
    ).toBe(
      "https://pic.sl.al/f/pic/2026-10-18/fileid_abc_report.pdf",
    );
    expect(normalizePicSlPublicUrl("http://pic.sl.al/f/pic/x.txt")).toBeNull();
    expect(normalizePicSlPublicUrl("https://evil.example/f/pic/x.txt")).toBeNull();
    expect(normalizePicSlPublicUrl("https://pic.sl.al/api/upload")).toBeNull();
    expect(
      normalizePicSlPublicUrl("https://user:pass@pic.sl.al/f/pic/x.txt"),
    ).toBeNull();
  });

  it("normalizes MIME types safely", () => {
    expect(normalizePicSlMimeType("text/plain; charset=utf-8")).toBe("text/plain");
    expect(normalizePicSlMimeType("")).toBe("application/octet-stream");
    expect(normalizePicSlMimeType("not a mime")).toBe("application/octet-stream");
  });
});
