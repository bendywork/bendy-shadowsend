import { describe, expect, it } from "vitest";
import {
  buildAnnouncementSaveInput,
  createAnnouncementEditorImages,
  removeAnnouncementEditorImage,
  selectAnnouncementImageFiles,
  validateAnnouncementDraft,
  type AnnouncementEditorImage,
} from "./announcement-editor";

const MAX_IMAGES = 3;
const MAX_BYTES = 200 * 1024 * 1024;

function makeFile(name: string, type: string, size: number): File {
  const file = new File([new Uint8Array(0)], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

describe("createAnnouncementEditorImages", () => {
  it("maps server images with stable existing indexes and fallback names", () => {
    const images = createAnnouncementEditorImages([
      { imageUrl: "/api/a?index=0", imageName: "a.png" },
      { imageUrl: "/api/a?index=1", imageName: null },
    ]);

    expect(images).toEqual([
      {
        id: "announcement-existing-0",
        kind: "existing",
        imageUrl: "/api/a?index=0",
        imageName: "a.png",
        existingIndex: 0,
      },
      {
        id: "announcement-existing-1",
        kind: "existing",
        imageUrl: "/api/a?index=1",
        imageName: "announcement-2",
        existingIndex: 1,
      },
    ]);
  });
});

describe("selectAnnouncementImageFiles", () => {
  it("accepts image files within the remaining slot budget", () => {
    const first = makeFile("a.png", "image/png", 10);
    const second = makeFile("b.webp", "image/webp", 20);

    const result = selectAnnouncementImageFiles([first, second], 1, MAX_IMAGES, MAX_BYTES);

    expect(result.accepted).toEqual([first, second]);
    expect(result.rejectedType).toBe(0);
    expect(result.rejectedSize).toBe(0);
    expect(result.rejectedLimit).toBe(0);
  });

  it("counts non-image and oversized files without accepting them", () => {
    const image = makeFile("a.png", "image/png", 10);
    const text = makeFile("notes.txt", "text/plain", 10);
    const huge = makeFile("huge.png", "image/png", MAX_BYTES + 1);

    const result = selectAnnouncementImageFiles([image, text, huge], 0, MAX_IMAGES, MAX_BYTES);

    expect(result.accepted).toEqual([image]);
    expect(result.rejectedType).toBe(1);
    expect(result.rejectedSize).toBe(1);
    expect(result.rejectedLimit).toBe(0);
  });

  it("trims the selection to the remaining slots and reports the overflow", () => {
    const files = [
      makeFile("a.png", "image/png", 1),
      makeFile("b.png", "image/png", 1),
      makeFile("c.png", "image/png", 1),
    ];

    const result = selectAnnouncementImageFiles(files, 2, MAX_IMAGES, MAX_BYTES);

    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0]).toBe(files[0]);
    expect(result.rejectedLimit).toBe(2);
  });

  it("accepts nothing when the image limit is already reached", () => {
    const result = selectAnnouncementImageFiles(
      [makeFile("a.png", "image/png", 1)],
      MAX_IMAGES,
      MAX_IMAGES,
      MAX_BYTES,
    );

    expect(result.accepted).toEqual([]);
    expect(result.rejectedLimit).toBe(1);
  });
});

describe("removeAnnouncementEditorImage", () => {
  it("returns a new array without mutating the original list", () => {
    const images: AnnouncementEditorImage[] = createAnnouncementEditorImages([
      { imageUrl: "/a", imageName: "a.png" },
      { imageUrl: "/b", imageName: "b.png" },
    ]);

    const next = removeAnnouncementEditorImage(images, "announcement-existing-0");

    expect(next).toHaveLength(1);
    expect(next[0].id).toBe("announcement-existing-1");
    expect(images).toHaveLength(2);
  });
});

describe("buildAnnouncementSaveInput", () => {
  it("separates kept image indexes from new files and trims the text", () => {
    const newFile = makeFile("new.png", "image/png", 5);
    const images: AnnouncementEditorImage[] = [
      ...createAnnouncementEditorImages([
        { imageUrl: "/a", imageName: "a.png" },
        { imageUrl: "/b", imageName: "b.png" },
      ]),
      {
        id: "announcement-new-1",
        kind: "new",
        imageUrl: "blob:new",
        imageName: "new.png",
        file: newFile,
      },
    ];

    const input = buildAnnouncementSaveInput("  hello  ", images);

    expect(input.text).toBe("hello");
    expect(input.keepImageIndexes).toEqual([0, 1]);
    expect(input.newFiles).toEqual([newFile]);
  });

  it("keeps the current existing-image order after removals", () => {
    const images = createAnnouncementEditorImages([
      { imageUrl: "/a", imageName: "a.png" },
      { imageUrl: "/b", imageName: "b.png" },
      { imageUrl: "/c", imageName: "c.png" },
    ]);

    const input = buildAnnouncementSaveInput("", [
      images[2],
      images[0],
    ]);

    expect(input.keepImageIndexes).toEqual([2, 0]);
    expect(input.newFiles).toEqual([]);
  });
});

describe("validateAnnouncementDraft", () => {
  it("rejects blank text without images", () => {
    expect(validateAnnouncementDraft("   ", [])).toBe("announcement.editor.empty");
  });

  it("accepts text-only and image-only drafts", () => {
    const image: AnnouncementEditorImage = {
      id: "new",
      kind: "new",
      imageUrl: "blob:x",
      imageName: "x.png",
      file: makeFile("x.png", "image/png", 1),
    };

    expect(validateAnnouncementDraft("hello", [])).toBeNull();
    expect(validateAnnouncementDraft("", [image])).toBeNull();
  });
});
