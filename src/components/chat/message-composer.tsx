"use client";

import {
  useId,
  useRef,
  type ChangeEvent,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import clsx from "clsx";
import {
  AlertCircle,
  Check,
  ClipboardPaste,
  CornerDownLeft,
  FileText,
  ImageIcon,
  LoaderCircle,
  Paperclip,
  RotateCcw,
  SendHorizonal,
  Video,
  X,
} from "lucide-react";
import { formatBytes } from "@/lib/client";
import { useT } from "@/lib/i18n/context";
import {
  canSubmitComposer,
  summarizeUploads,
  type UploadSummary,
  type UploadTask,
} from "@/lib/upload-queue";

type Translator = ReturnType<typeof useT>;

type MessageComposerProps = {
  text: string;
  maxTextLength: number;
  attachments: UploadTask[];
  enterToSend: boolean;
  onTextChange: (value: string) => void;
  onAddFiles: (files: File[]) => void;
  onRemoveAttachment: (id: string) => void;
  onRetryAttachment: (id: string) => void;
  onRetryAllFailed: () => void;
  onToggleEnterToSend: () => void;
  onReadClipboard: () => void;
  onSubmit: () => void;
};

function attachmentStatusText(task: UploadTask, t: Translator) {
  if (task.status === "queued") return t("composer.upload.queued");
  if (task.status === "done") return t("composer.upload.done");
  if (task.status === "failed") {
    return task.error ?? t("composer.upload.failed");
  }

  const base = t("composer.upload.uploading", { percent: task.progress });
  if (!task.chunkCount || task.chunkCount <= 1) return base;
  return `${base} · ${t("composer.upload.chunk", {
    index: (task.chunkIndex ?? 0) + 1,
    total: task.chunkCount,
  })}`;
}

function AttachmentIcon({ task }: { task: UploadTask }) {
  if (task.file.type.startsWith("image/")) {
    return <ImageIcon className="composer-chip__icon" aria-hidden="true" />;
  }
  if (task.file.type.startsWith("video/")) {
    return <Video className="composer-chip__icon" aria-hidden="true" />;
  }
  return <FileText className="composer-chip__icon" aria-hidden="true" />;
}

function AttachmentChip({
  task,
  onRemove,
  onRetry,
}: {
  task: UploadTask;
  onRemove: () => void;
  onRetry: () => void;
}) {
  const t = useT();
  const isUploading = task.status === "uploading";

  return (
    <div
      role="listitem"
      className="composer-chip"
      data-status={task.status}
    >
      <span className="composer-chip__glyph" aria-hidden="true">
        {task.status === "done" ? (
          <Check className="composer-chip__icon" />
        ) : task.status === "failed" ? (
          <AlertCircle className="composer-chip__icon" />
        ) : (
          <AttachmentIcon task={task} />
        )}
      </span>

      <span className="composer-chip__body">
        <span className="composer-chip__name" title={task.file.name}>
          {task.file.name}
        </span>
        <span className="composer-chip__meta">
          <span className="tabular-nums">{formatBytes(task.file.size)}</span>
          <span aria-hidden="true">·</span>
          <span className="composer-chip__status">
            {isUploading ? (
              <LoaderCircle className="composer-chip__spinner" aria-hidden="true" />
            ) : null}
            {attachmentStatusText(task, t)}
          </span>
        </span>
        {isUploading ? (
          <span
            className="composer-chip__track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={task.progress}
            aria-label={t("composer.upload.progress", { name: task.file.name })}
          >
            <span
              className="composer-chip__fill"
              style={{ transform: `scaleX(${task.progress / 100})` }}
            />
          </span>
        ) : null}
      </span>

      {task.status === "failed" ? (
        <button
          type="button"
          className="composer-chip__action"
          onClick={onRetry}
          aria-label={t("composer.upload.retryName", { name: task.file.name })}
          title={t("composer.upload.retry")}
        >
          <RotateCcw className="composer-chip__icon" aria-hidden="true" />
        </button>
      ) : null}

      <button
        type="button"
        className="composer-chip__action"
        onClick={onRemove}
        aria-label={t("composer.upload.removeName", { name: task.file.name })}
        title={t("composer.removeFile")}
      >
        <X className="composer-chip__icon" aria-hidden="true" />
      </button>
    </div>
  );
}

function UploadSummaryBar({
  summary,
  onRetryAllFailed,
}: {
  summary: UploadSummary;
  onRetryAllFailed: () => void;
}) {
  const t = useT();
  if (summary.total === 0 || (!summary.active && !summary.hasFailure)) {
    return null;
  }

  const label = summary.hasFailure
    ? t("composer.upload.hasFailed", { count: summary.failed })
    : t("composer.upload.summary", {
        done: summary.done,
        total: summary.total,
        percent: summary.percent,
      });

  return (
    <div className="composer-summary" role="status" aria-live="polite">
      <div className="composer-summary__row">
        <span className="composer-summary__label">{label}</span>
        {summary.hasFailure ? (
          <button
            type="button"
            className="composer-summary__retry"
            onClick={onRetryAllFailed}
          >
            <RotateCcw className="h-3 w-3" aria-hidden="true" />
            {t("composer.upload.retryAll")}
          </button>
        ) : null}
      </div>
      <span
        className="composer-summary__track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={summary.percent}
        aria-label={t("composer.upload.overallProgress")}
      >
        <span
          className={clsx(
            "composer-summary__fill",
            summary.hasFailure && "composer-summary__fill--danger",
          )}
          style={{ transform: `scaleX(${summary.percent / 100})` }}
        />
      </span>
    </div>
  );
}

export function MessageComposer({
  text,
  maxTextLength,
  attachments,
  enterToSend,
  onTextChange,
  onAddFiles,
  onRemoveAttachment,
  onRetryAttachment,
  onRetryAllFailed,
  onToggleEnterToSend,
  onReadClipboard,
  onSubmit,
}: MessageComposerProps) {
  const t = useT();
  const formRef = useRef<HTMLFormElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const inputId = useId();
  const hintId = useId();
  const summary = summarizeUploads(attachments);
  const canSubmit = canSubmitComposer(text, attachments);
  const blockedReason = summary.hasFailure
    ? t("composer.upload.hasFailed", { count: summary.failed })
    : summary.active
      ? t("composer.upload.waiting")
      : undefined;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    onSubmit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!enterToSend || event.key !== "Enter") return;
    if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.nativeEvent.isComposing) return;

    event.preventDefault();
    if (canSubmit) formRef.current?.requestSubmit();
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const pastedFiles = Array.from(event.clipboardData.files);
    if (pastedFiles.length === 0) return;
    event.preventDefault();
    onAddFiles(pastedFiles);
  }

  function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) onAddFiles(Array.from(event.target.files));
    event.target.value = "";
  }

  return (
    <form
      ref={formRef}
      className="composer"
      onSubmit={submit}
      aria-busy={summary.active}
    >
      {attachments.length > 0 ? (
        <div
          className="composer__attachments"
          role="list"
          aria-label={t("composer.attachments")}
        >
          {attachments.map((task) => (
            <AttachmentChip
              key={task.id}
              task={task}
              onRemove={() => onRemoveAttachment(task.id)}
              onRetry={() => onRetryAttachment(task.id)}
            />
          ))}
        </div>
      ) : null}

      <UploadSummaryBar summary={summary} onRetryAllFailed={onRetryAllFailed} />

      <div className="composer__surface">
        <label htmlFor={inputId} className="sr-only">
          {t("composer.inputLabel")}
        </label>
        <textarea
          id={inputId}
          value={text}
          onChange={(event) => onTextChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          maxLength={maxTextLength}
          placeholder={t("composer.placeholder")}
          aria-describedby={hintId}
          className="composer__textarea"
        />

        <div className="composer__toolbar">
          <div className="composer__tools">
            <button
              type="button"
              className="composer-tool"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
              {t("composer.attach")}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="sr-only"
              onChange={handleFileInput}
              tabIndex={-1}
            />
            <button
              type="button"
              className="composer-tool"
              onClick={onReadClipboard}
            >
              <ClipboardPaste className="h-3.5 w-3.5" aria-hidden="true" />
              {t("composer.clipboard")}
            </button>
            <button
              type="button"
              role="switch"
              aria-checked={enterToSend}
              className="composer-tool"
              data-active={enterToSend}
              onClick={onToggleEnterToSend}
            >
              <CornerDownLeft className="h-3.5 w-3.5" aria-hidden="true" />
              {t("composer.enterToSend")} ·{" "}
              {enterToSend ? t("common.on") : t("common.off")}
            </button>
          </div>

          <div className="composer__actions">
            <span
              className="composer__counter tabular-nums"
              data-level={
                text.length >= maxTextLength
                  ? "danger"
                  : text.length > maxTextLength * 0.9
                    ? "warning"
                    : "normal"
              }
            >
              {text.length}/{maxTextLength}
            </span>
            <button
              type="submit"
              className="composer__send"
              disabled={!canSubmit}
              title={blockedReason}
            >
              {summary.active ? (
                <LoaderCircle
                  className="h-3.5 w-3.5 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <SendHorizonal className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {summary.active ? t("composer.uploading") : t("composer.send")}
            </button>
          </div>
        </div>
      </div>

      <p id={hintId} className="sr-only">
        {t("composer.hint")}
      </p>
    </form>
  );
}
