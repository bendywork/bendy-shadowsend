import { describe, expect, it, vi } from "vitest";
import { copyTextToClipboard } from "@/lib/clipboard";

function createFakeDocument(result: boolean) {
  const textarea = {
    value: "",
    style: {} as Record<string, string>,
    setAttribute: vi.fn(),
    focus: vi.fn(),
    select: vi.fn(),
  };
  const body = {
    appendChild: vi.fn(),
    removeChild: vi.fn(),
  };
  const execCommand = vi.fn(() => result);
  const documentRef = {
    createElement: vi.fn(() => textarea),
    body,
    execCommand,
  } as unknown as Document;

  return { documentRef, textarea, body, execCommand };
}

describe("copyTextToClipboard", () => {
  it("uses the async clipboard API when available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    await expect(
      copyTextToClipboard("hello", { clipboard: { writeText }, document: null }),
    ).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("falls back to execCommand when the clipboard API is rejected", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("permission denied"));
    const { documentRef, textarea, body, execCommand } = createFakeDocument(true);

    await expect(
      copyTextToClipboard("hello", {
        clipboard: { writeText },
        document: documentRef,
      }),
    ).resolves.toBe(true);

    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(textarea.value).toBe("hello");
    expect(textarea.setAttribute).toHaveBeenCalledWith("readonly", "");
    expect(body.appendChild).toHaveBeenCalledWith(textarea);
    expect(body.removeChild).toHaveBeenCalledWith(textarea);
  });

  it("returns false when no copy API exists", async () => {
    await expect(
      copyTextToClipboard("hello", { clipboard: null, document: null }),
    ).resolves.toBe(false);
  });

  it("returns false and cleans up when execCommand throws", async () => {
    const { documentRef, body, execCommand } = createFakeDocument(true);
    execCommand.mockImplementation(() => {
      throw new Error("copy blocked");
    });

    await expect(
      copyTextToClipboard("hello", { clipboard: null, document: documentRef }),
    ).resolves.toBe(false);
    expect(body.removeChild).toHaveBeenCalledTimes(1);
  });

  it("does not touch the clipboard for empty text", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    await expect(
      copyTextToClipboard("", { clipboard: { writeText }, document: null }),
    ).resolves.toBe(false);
    expect(writeText).not.toHaveBeenCalled();
  });
});
