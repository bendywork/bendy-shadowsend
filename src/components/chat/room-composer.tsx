"use client";

import type {
  ClipboardEvent,
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  RefObject,
} from "react";
import clsx from "clsx";
import {
  Copy,
  CornerDownLeft,
  FileText,
  Plus,
  SendHorizonal,
  X,
} from "lucide-react";
import { formatBytes } from "@/lib/client";
import { MAX_MESSAGE_TEXT_CHARS } from "@/lib/constants";
import { useT } from "@/lib/i18n/context";

type Props = {
  text: string;
  files: File[];
  enterToSend: boolean;
  composerFormRef: RefObject<HTMLFormElement | null>;
  clampMessageText: (value: string) => string;
  setText: (value: string) => void;
  addFiles: (input: FileList | File[]) => void;
  removeFile: (index: number) => void;
  readClipboard: () => Promise<void>;
  onPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
  onComposerKeyDown: (
    event: ReactKeyboardEvent<HTMLTextAreaElement>,
  ) => void;
  send: (event: FormEvent<HTMLFormElement>) => void;
  toggleEnterToSend: () => void;
};

export function RoomComposer({
  text,
  files,
  enterToSend,
  composerFormRef,
  clampMessageText,
  setText,
  addFiles,
  removeFile,
  readClipboard,
  onPaste,
  onComposerKeyDown,
  send,
  toggleEnterToSend,
}: Props) {
  const t = useT();

  return (
    <form
      ref={composerFormRef}
      onSubmit={send}
      className="border-t border-line-subtle p-3 sm:p-4"
    >
      {files.length ? (
        <div className="mb-2 flex flex-wrap gap-2">
          {files.map((file, index) => (
            <span
              key={`${file.name}-${file.size}-${index}`}
              className="inline-flex max-w-full items-center gap-1.5 rounded-xl border border-line bg-panel px-2.5 py-1.5 text-xs text-ink-soft"
            >
              <FileText className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
              <span className="max-w-[200px] truncate">{file.name}</span>
              <span className="shrink-0 text-[10px] text-ink-faint">
                {formatBytes(file.size)}
              </span>
              <button
                type="button"
                aria-label={t("composer.removeFile")}
                onClick={() => removeFile(index)}
                className="ml-0.5 rounded-full p-0.5 text-ink-muted transition-ui hover:bg-elevated-strong hover:text-ink"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className="rounded-2xl border border-line bg-panel/80 p-2 transition-ui focus-within:border-action-border focus-within:ring-2 focus-within:ring-action-soft">
        <textarea
          value={text}
          onChange={(e) => setText(clampMessageText(e.target.value))}
          onPaste={onPaste}
          onKeyDown={onComposerKeyDown}
          maxLength={MAX_MESSAGE_TEXT_CHARS}
          placeholder={t("composer.placeholder")}
          className="min-h-[96px] w-full resize-none rounded-xl bg-transparent px-3 py-2 text-sm leading-6 text-ink outline-none placeholder:text-ink-faint"
        />
        <div className="mt-1 flex flex-wrap items-center gap-2 px-1 pb-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <label className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg border border-line px-2.5 text-xs text-ink-soft transition-ui hover:bg-elevated">
              <Plus className="h-3.5 w-3.5" />
              {t("composer.attach")}
              <input
                type="file"
                className="hidden"
                multiple
                onChange={(e) => {
                  if (e.target.files) {
                    addFiles(e.target.files);
                    e.target.value = "";
                  }
                }}
              />
            </label>
            <button
              type="button"
              onClick={readClipboard}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-line px-2.5 text-xs text-ink-soft transition-ui hover:bg-elevated"
            >
              <Copy className="h-3.5 w-3.5" />
              {t("composer.clipboard")}
            </button>
            <button
              type="button"
              role="switch"
              aria-checked={enterToSend}
              onClick={toggleEnterToSend}
              className={clsx(
                "inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-xs transition-ui",
                enterToSend
                  ? "border-action-border bg-action-soft text-ink"
                  : "border-line text-ink-soft hover:bg-elevated",
              )}
            >
              <CornerDownLeft className="h-3.5 w-3.5" />
              {t("composer.enterToSend")} ·{" "}
              {enterToSend ? t("common.on") : t("common.off")}
            </button>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span
              className={clsx(
                "text-[11px] tabular-nums",
                text.length >= MAX_MESSAGE_TEXT_CHARS
                  ? "text-danger"
                  : text.length > MAX_MESSAGE_TEXT_CHARS * 0.9
                    ? "text-warning"
                    : "text-ink-faint",
              )}
            >
              {text.length}/{MAX_MESSAGE_TEXT_CHARS}
            </span>
            <button
              type="submit"
              disabled={!text.trim() && files.length === 0}
              className="btn-primary inline-flex items-center gap-1 px-3.5 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40"
            >
              <SendHorizonal className="h-3.5 w-3.5" />
              {t("composer.send")}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
