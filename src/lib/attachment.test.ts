import { describe, expect, it } from "vitest";
import {
  getAttachmentKind,
  getAttachmentTypeKey,
  getFileExtension,
  isPreviewableAttachment,
} from "./attachment";

describe("getFileExtension", () => {
  it("returns the lowercase extension of a plain file name", () => {
    expect(getFileExtension("Report.PDF")).toBe("pdf");
  });

  it("ignores dots in directory names and handles paths", () => {
    expect(getFileExtension("/tmp/v1.2/archive.tar.gz")).toBe("gz");
    expect(getFileExtension("C:\\Users\\me\\notes.TXT")).toBe("txt");
  });

  it("returns an empty string for names without a usable extension", () => {
    expect(getFileExtension("README")).toBe("");
    expect(getFileExtension(".env")).toBe("");
    expect(getFileExtension("trailing.")).toBe("");
  });
});

describe("getAttachmentKind", () => {
  it.each([
    ["image/png", "photo.png", "image"],
    ["video/mp4", "clip.mp4", "video"],
    ["audio/mpeg", "song.mp3", "audio"],
    ["application/pdf", "spec.pdf", "pdf"],
    [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "letter.docx",
      "word",
    ],
    [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "sheet.xlsx",
      "spreadsheet",
    ],
    [
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "deck.pptx",
      "presentation",
    ],
    ["application/zip", "bundle.zip", "archive"],
    ["application/json", "data.json", "code"],
    ["text/plain", "notes.txt", "text"],
  ])("maps %s / %s to %s", (mimeType, fileName, expected) => {
    expect(getAttachmentKind(mimeType, fileName)).toBe(expected);
  });

  it("falls back to the file extension when the MIME type is generic", () => {
    expect(getAttachmentKind("application/octet-stream", "backup.7z")).toBe(
      "archive",
    );
    expect(getAttachmentKind("", "Component.TSX")).toBe("code");
    expect(getAttachmentKind("application/octet-stream", "slides.key")).toBe(
      "presentation",
    );
  });

  it("returns other for unknown MIME types and extensions", () => {
    expect(getAttachmentKind("application/octet-stream", "blob.bin")).toBe(
      "other",
    );
    expect(getAttachmentKind("", "unknown")).toBe("other");
  });

  it("prefers a specific MIME type over a misleading extension", () => {
    expect(getAttachmentKind("image/svg+xml", "diagram.pdf")).toBe("image");
  });
});

describe("getAttachmentTypeKey", () => {
  it("maps every kind to a translation key", () => {
    expect(getAttachmentTypeKey("image")).toBe("attachment.type.image");
    expect(getAttachmentTypeKey("spreadsheet")).toBe(
      "attachment.type.spreadsheet",
    );
    expect(getAttachmentTypeKey("other")).toBe("attachment.type.other");
  });
});

describe("isPreviewableAttachment", () => {
  it("only accepts IMAGE and VIDEO preview types", () => {
    expect(isPreviewableAttachment("IMAGE")).toBe(true);
    expect(isPreviewableAttachment("VIDEO")).toBe(true);
    expect(isPreviewableAttachment("NONE")).toBe(false);
    expect(isPreviewableAttachment("image")).toBe(false);
  });
});
