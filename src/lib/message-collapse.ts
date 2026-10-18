/**
 * 长消息折叠规则（REQ-202610-0485 / ui-22）。
 *
 * 折叠判定同时考虑字符数与行数：纯字符阈值会漏掉「很多短行」的代码/日志，
 * 纯行数阈值又会漏掉没有换行的长段落。预览优先在段落、换行、句末标点处截断，
 * 避免把单词或 emoji 从中间切开。
 */

export const MESSAGE_COLLAPSE_CHAR_THRESHOLD = 600;
export const MESSAGE_COLLAPSE_LINE_THRESHOLD = 12;
export const MESSAGE_COLLAPSE_PREVIEW_LINES = 8;
export const MESSAGE_COLLAPSE_PREVIEW_MIN = 240;
export const MESSAGE_COLLAPSE_PREVIEW_MAX = 420;

export type MessageCollapseState = {
  collapsible: boolean;
  preview: string;
  remaining: number;
};

const SENTENCE_END_RE = /[。！？!?；;…]/;
const LINE_BREAK_RE = /\r?\n/;

function countLines(content: string): number {
  return content.split(LINE_BREAK_RE).length;
}

export function shouldCollapseMessage(content: string): boolean {
  if (!content) return false;
  return (
    content.length > MESSAGE_COLLAPSE_CHAR_THRESHOLD ||
    countLines(content) > MESSAGE_COLLAPSE_LINE_THRESHOLD
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function adjustSurrogateBoundary(content: string, index: number): number {
  if (index <= 0 || index >= content.length) return index;
  const previous = content.charCodeAt(index - 1);
  const current = content.charCodeAt(index);
  const splitsPair =
    previous >= 0xd800 &&
    previous <= 0xdbff &&
    current >= 0xdc00 &&
    current <= 0xdfff;
  return splitsPair ? index - 1 : index;
}

function findLastIndex(
  content: string,
  limit: number,
  predicate: (char: string) => boolean,
): number {
  for (let index = limit - 1; index >= 0; index -= 1) {
    if (predicate(content[index])) return index;
  }
  return -1;
}

function findPreviewCut(content: string, target: number): number {
  const limit = Math.min(target, content.length - 1);
  if (limit <= 0) return 0;
  const lowerBound = Math.max(1, Math.floor(limit * 0.6));

  const paragraph = content.slice(0, limit).lastIndexOf("\n\n");
  if (paragraph >= lowerBound) {
    return adjustSurrogateBoundary(content, paragraph);
  }

  const line = content.slice(0, limit).lastIndexOf("\n");
  if (line >= lowerBound) {
    return adjustSurrogateBoundary(content, line);
  }

  const sentence = findLastIndex(content, limit, (char) => SENTENCE_END_RE.test(char));
  if (sentence + 1 >= lowerBound) {
    return adjustSurrogateBoundary(content, sentence + 1);
  }

  const whitespace = findLastIndex(content, limit, (char) => /\s/.test(char));
  if (whitespace >= lowerBound) {
    return adjustSurrogateBoundary(content, whitespace);
  }

  return adjustSurrogateBoundary(content, limit);
}

function buildCharPreview(content: string): string {
  const target = clamp(
    Math.round(content.length * 0.35),
    MESSAGE_COLLAPSE_PREVIEW_MIN,
    MESSAGE_COLLAPSE_PREVIEW_MAX,
  );
  const cut = findPreviewCut(content, target);
  const preview = content.slice(0, cut).trimEnd();
  if (preview) return preview;
  return content
    .slice(0, Math.max(0, Math.min(MESSAGE_COLLAPSE_PREVIEW_MIN, content.length - 1)))
    .trimEnd();
}

export function getMessageCollapseState(content: string): MessageCollapseState {
  if (!shouldCollapseMessage(content)) {
    return { collapsible: false, preview: content, remaining: 0 };
  }

  const preview =
    content.length > MESSAGE_COLLAPSE_CHAR_THRESHOLD
      ? buildCharPreview(content)
      : content
          .split(LINE_BREAK_RE)
          .slice(0, MESSAGE_COLLAPSE_PREVIEW_LINES)
          .join("\n")
          .trimEnd();

  return {
    collapsible: true,
    preview,
    remaining: Math.max(0, content.length - preview.length),
  };
}
