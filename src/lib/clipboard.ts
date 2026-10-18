/**
 * 统一的文本复制入口（REQ-202610-0485 / ui-22）。
 *
 * 优先使用异步 Clipboard API；在非安全上下文、权限被拒或旧浏览器上回退到
 * textarea + execCommand，避免复制按钮静默失败。调用方只需判断布尔结果。
 */

export type ClipboardDependencies = {
  clipboard?: Pick<Clipboard, "writeText"> | null;
  document?: Document | null;
};

function resolveClipboard(deps: ClipboardDependencies): Pick<Clipboard, "writeText"> | null {
  if (deps.clipboard !== undefined) return deps.clipboard;
  if (typeof navigator === "undefined") return null;
  return navigator.clipboard ?? null;
}

function resolveDocument(deps: ClipboardDependencies): Document | null {
  if (deps.document !== undefined) return deps.document;
  if (typeof document === "undefined") return null;
  return document;
}

function copyWithTextarea(text: string, doc: Document): boolean {
  if (typeof doc.execCommand !== "function" || !doc.body) return false;

  const textarea = doc.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  doc.body.appendChild(textarea);

  try {
    textarea.focus();
    textarea.select();
    return doc.execCommand("copy");
  } catch {
    return false;
  } finally {
    doc.body.removeChild(textarea);
  }
}

export async function copyTextToClipboard(
  text: string,
  deps: ClipboardDependencies = {},
): Promise<boolean> {
  if (!text) return false;

  const clipboard = resolveClipboard(deps);
  if (clipboard?.writeText) {
    try {
      await clipboard.writeText(text);
      return true;
    } catch {
      // 权限被拒或非安全上下文：继续尝试同步回退方案。
    }
  }

  const doc = resolveDocument(deps);
  if (!doc) return false;
  return copyWithTextarea(text, doc);
}
