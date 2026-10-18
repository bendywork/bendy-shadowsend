// 键盘交互的纯逻辑。与 DOM 解耦，便于单测覆盖所有分支；
// 具体焦点移动由 use-dialog-keyboard / use-menu-keyboard 负责。

/** 可在对话框内参与 Tab 循环的元素。隐藏控件与 tabindex=-1 不参与。 */
export const FOCUSABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  "object",
  "embed",
  "audio[controls]",
  "video[controls]",
  "summary",
  "[contenteditable]:not([contenteditable='false'])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export type ComposerKeyEvent = {
  key: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  isComposing?: boolean;
  keyCode?: number;
};

/**
 * 输入框的 Enter 发送判定：
 * - 输入法组合中（isComposing 或 keyCode 229）永远不发送；
 * - Ctrl/Cmd+Enter 始终发送（即使关闭了“回车发送”）；
 * - Alt+Enter、Shift+Enter 保持换行；
 * - 开启“回车发送”时，单独 Enter 发送。
 */
export function shouldSubmitComposer(
  event: ComposerKeyEvent,
  enterToSend: boolean,
): boolean {
  if (event.key !== "Enter") return false;
  if (event.isComposing || event.keyCode === 229) return false;
  if (event.altKey) return false;

  const forceSend = Boolean(event.ctrlKey || event.metaKey) && !event.shiftKey;
  if (forceSend) return true;
  if (!enterToSend) return false;

  return !event.shiftKey && !event.ctrlKey && !event.metaKey;
}

/**
 * 菜单方向键导航，返回下一个应聚焦的索引。
 * 无选中项时，ArrowDown/Home 到首项，ArrowUp/End 到末项；首尾循环。
 */
export function getMenuFocusIndex(
  currentIndex: number,
  itemCount: number,
  key: string,
): number | null {
  if (itemCount <= 0) return null;

  switch (key) {
    case "ArrowDown":
      return currentIndex < 0 || currentIndex >= itemCount - 1 ? 0 : currentIndex + 1;
    case "ArrowUp":
      return currentIndex <= 0 ? itemCount - 1 : currentIndex - 1;
    case "Home":
      return 0;
    case "End":
      return itemCount - 1;
    default:
      return null;
  }
}

/**
 * Tab / Shift+Tab 焦点陷阱：首尾循环；当前焦点不在列表内时，
 * 正向进入首项，反向进入末项。返回 -1 表示没有可聚焦元素。
 */
export function getFocusTrapIndex(
  currentIndex: number,
  itemCount: number,
  shiftKey: boolean,
): number {
  if (itemCount <= 0) return -1;
  if (currentIndex < 0) return shiftKey ? itemCount - 1 : 0;
  if (shiftKey) return currentIndex === 0 ? itemCount - 1 : currentIndex - 1;
  return currentIndex >= itemCount - 1 ? 0 : currentIndex + 1;
}
