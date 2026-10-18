import { describe, expect, it } from "vitest";
import {
  MESSAGE_COLLAPSE_CHAR_THRESHOLD,
  MESSAGE_COLLAPSE_PREVIEW_MAX,
  MESSAGE_COLLAPSE_PREVIEW_MIN,
  getMessageCollapseState,
  shouldCollapseMessage,
} from "@/lib/message-collapse";

describe("shouldCollapseMessage", () => {
  it("keeps short single-line messages expanded", () => {
    expect(shouldCollapseMessage("")).toBe(false);
    expect(shouldCollapseMessage("hello")).toBe(false);
  });

  it("collapses only after the character threshold is exceeded", () => {
    expect(shouldCollapseMessage("a".repeat(MESSAGE_COLLAPSE_CHAR_THRESHOLD))).toBe(false);
    expect(shouldCollapseMessage("a".repeat(MESSAGE_COLLAPSE_CHAR_THRESHOLD + 1))).toBe(true);
  });

  it("collapses many short lines even when the character count is low", () => {
    const thirteenLines = Array.from({ length: 13 }, () => "line").join("\n");
    const twelveLines = Array.from({ length: 12 }, () => "line").join("\n");
    expect(shouldCollapseMessage(twelveLines)).toBe(false);
    expect(shouldCollapseMessage(thirteenLines)).toBe(true);
  });
});

describe("getMessageCollapseState", () => {
  it("returns the full content when no collapse is needed", () => {
    expect(getMessageCollapseState("hello")).toEqual({
      collapsible: false,
      preview: "hello",
      remaining: 0,
    });
  });

  it("keeps the preview within the configured character window", () => {
    const content = "a".repeat(MESSAGE_COLLAPSE_CHAR_THRESHOLD + 1);
    const state = getMessageCollapseState(content);
    expect(state.collapsible).toBe(true);
    expect(state.preview.length).toBeGreaterThanOrEqual(MESSAGE_COLLAPSE_PREVIEW_MIN);
    expect(state.preview.length).toBeLessThanOrEqual(MESSAGE_COLLAPSE_PREVIEW_MAX);
    expect(state.remaining).toBe(content.length - state.preview.length);
  });

  it("prefers a paragraph boundary over cutting mid-sentence", () => {
    const firstParagraph = "A".repeat(200);
    const content = `${firstParagraph}\n\n${"B".repeat(500)}`;
    const state = getMessageCollapseState(content);
    expect(state.preview).toBe(firstParagraph);
    expect(state.remaining).toBe(content.length - firstParagraph.length);
  });

  it("cuts after sentence punctuation when no line break is available", () => {
    const sentence = `${"甲".repeat(200)}。`;
    const content = `${sentence}${"乙".repeat(500)}`;
    const state = getMessageCollapseState(content);
    expect(state.preview).toBe(sentence);
  });

  it("cuts at whitespace instead of splitting a word", () => {
    const content = `${"word ".repeat(100)}${"x".repeat(300)}`;
    const state = getMessageCollapseState(content);
    expect(state.preview.endsWith("word")).toBe(true);
    expect(state.preview.endsWith(" ")).toBe(false);
  });

  it("never splits a surrogate pair (emoji)", () => {
    const content = `${"😀".repeat(300)}${"x".repeat(300)}`;
    const state = getMessageCollapseState(content);
    expect(state.preview.includes("�")).toBe(false);
    expect([...state.preview].every((char) => char === "😀")).toBe(true);
    expect(state.remaining).toBe(content.length - state.preview.length);
  });

  it("uses the first eight lines when collapse is line-driven", () => {
    const lines = Array.from({ length: 13 }, (_, index) => `line-${index + 1}`);
    const content = lines.join("\n");
    const state = getMessageCollapseState(content);
    expect(state.collapsible).toBe(true);
    expect(state.preview).toBe(lines.slice(0, 8).join("\n"));
    expect(state.remaining).toBe(content.length - state.preview.length);
  });
});
