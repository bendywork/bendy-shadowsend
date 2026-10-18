"use client";

import clsx from "clsx";
import { RotateCw } from "lucide-react";

import type { UploadItemStatus } from "@/lib/upload/queue";

export type UploadProgressState = {
  status: UploadItemStatus;
  progress: number;
  attempt: number;
  maxAttempts: number;
  error?: string;
};

export type UploadProgressLabels = {
  queued: string;
  uploading: string;
  retrying: string;
  done: string;
  failed: string;
  retry: string;
};

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function fill(
  template: string,
  params: Record<string, string | number>,
): string {
  let output = template;
  for (const [key, value] of Object.entries(params)) {
    output = output.replace(new RegExp(`\\{${key}\\}`, "g"), String(value));
  }
  return output;
}

export function UploadProgress({
  state,
  labels,
  onRetry,
  className,
}: {
  state: UploadProgressState;
  labels: UploadProgressLabels;
  onRetry?: () => void;
  className?: string;
}) {
  const percent = clampPercent(state.progress);
  const isActive =
    state.status === "queued" ||
    state.status === "uploading" ||
    state.status === "retrying";

  const statusText =
    state.status === "queued"
      ? labels.queued
      : state.status === "uploading"
        ? fill(labels.uploading, { percent })
        : state.status === "retrying"
          ? fill(labels.retrying, {
              attempt: state.attempt,
              max: state.maxAttempts,
            })
          : state.status === "done"
            ? labels.done
            : labels.failed;

  return (
    <div
      className={clsx("mt-2 space-y-1.5", className)}
      data-upload-status={state.status}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          className={clsx(
            "text-[11px] tabular-nums",
            state.status === "failed"
              ? "text-danger"
              : state.status === "done"
                ? "text-success"
                : "text-ink-faint",
          )}
        >
          {statusText}
        </span>

        {state.status === "failed" && onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] text-ink-soft transition-ui hover:border-line-strong hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action-border active:translate-y-px"
          >
            <RotateCw className="h-3 w-3" />
            {labels.retry}
          </button>
        ) : null}
      </div>

      {isActive ? (
        <div
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={statusText}
          className="h-1.5 overflow-hidden rounded-full bg-elevated-strong"
        >
          <div
            className={clsx(
              "h-full origin-left rounded-full transition-transform duration-300 ease-out",
              state.status === "retrying" ? "bg-danger" : "bg-action",
            )}
            style={{ transform: `scaleX(${percent / 100})` }}
          />
        </div>
      ) : null}

      {state.status === "failed" && state.error ? (
        <p className="break-words text-[11px] leading-4 text-danger">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}
