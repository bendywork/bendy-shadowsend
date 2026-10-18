"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import clsx from "clsx";
import {
  Download,
  File,
  FileArchive,
  FileCode,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  LoaderCircle,
  Music,
  Presentation,
  RefreshCw,
  Video,
  type LucideIcon,
} from "lucide-react";
import { formatBytes } from "@/lib/client";
import { resolveErrorMessage } from "@/lib/feedback";
import { getAttachmentKind, getAttachmentTypeKey, type AttachmentKind } from "@/lib/attachment";
import { useT } from "@/lib/i18n/context";

export type AttachmentCardData = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  previewType: "IMAGE" | "VIDEO" | "NONE";
  previewUrl?: string | null;
};

export type AttachmentCardStatus = "ready" | "uploading" | "failed";

export type AttachmentCardProps = {
  attachment: AttachmentCardData;
  status?: AttachmentCardStatus;
  progress?: number;
  errorMessage?: string | null;
  onPreview?: () => void;
  onDownload?: () => Promise<void> | void;
  onRetry?: () => void;
  onError?: (message: string) => void;
  className?: string;
};

const KIND_ICONS: Record<AttachmentKind, LucideIcon> = {
  image: ImageIcon,
  video: Video,
  audio: Music,
  pdf: FileText,
  word: FileText,
  spreadsheet: FileSpreadsheet,
  presentation: Presentation,
  archive: FileArchive,
  code: FileCode,
  text: FileText,
  other: File,
};

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

/**
 * One attachment card for both sent messages and optimistic pending messages.
 *
 * States:
 * - ready: metadata + preview/download actions
 * - uploading: progress bar, actions disabled
 * - failed: error copy + retry action
 *
 * The media area also owns a local "preview failed" state so a broken remote
 * preview never leaves an empty black box in the conversation.
 */
export function AttachmentCard({
  attachment,
  status = "ready",
  progress = 0,
  errorMessage,
  onPreview,
  onDownload,
  onRetry,
  onError,
  className,
}: AttachmentCardProps) {
  const t = useT();
  const [previewFailed, setPreviewFailed] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const kind = getAttachmentKind(attachment.mimeType, attachment.fileName);
  const Icon = KIND_ICONS[kind];
  const percent = clampPercent(progress);
  const hasMediaPreview =
    status !== "failed" &&
    Boolean(attachment.previewUrl) &&
    (attachment.previewType === "IMAGE" || attachment.previewType === "VIDEO");

  async function handleDownload() {
    if (!onDownload || downloading) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      await onDownload();
    } catch (error) {
      const message = resolveErrorMessage(error, t("attachment.downloadFailed"), t);
      setDownloadError(message);
      onError?.(message);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <article
      className={clsx(
        "attachment-card",
        status === "failed" && "attachment-card--failed",
        className,
      )}
      aria-label={attachment.fileName}
    >
      {hasMediaPreview ? (
        <div className="attachment-card__media">
          {previewFailed ? (
            <div className="attachment-card__preview-fallback">
              <Icon aria-hidden="true" />
              <span>{t("attachment.previewFailed")}</span>
            </div>
          ) : attachment.previewType === "IMAGE" ? (
            <button
              type="button"
              className="attachment-card__media-button"
              onClick={onPreview}
              aria-label={`${t("attachment.preview")}: ${attachment.fileName}`}
              disabled={!onPreview}
            >
              <img
                src={attachment.previewUrl ?? ""}
                alt={t("attachment.imageAlt", { name: attachment.fileName })}
                loading="lazy"
                onError={() => setPreviewFailed(true)}
              />
            </button>
          ) : (
            <video
              src={attachment.previewUrl ?? ""}
              controls
              preload="metadata"
              className="attachment-card__video"
              onError={() => setPreviewFailed(true)}
            >
              {t("attachment.videoUnsupported")}
            </video>
          )}
        </div>
      ) : null}

      <div className="attachment-card__body">
        <span className="attachment-card__icon" aria-hidden="true">
          <Icon />
        </span>

        <div className="attachment-card__info">
          <p className="attachment-card__name" title={attachment.fileName}>
            {attachment.fileName}
          </p>
          <p className="attachment-card__meta">
            <span>{t(getAttachmentTypeKey(kind))}</span>
            <span className="attachment-card__dot" aria-hidden="true">
              ·
            </span>
            <span className="type-numeric">{formatBytes(attachment.sizeBytes)}</span>
          </p>

          {status === "uploading" ? (
            <div className="attachment-card__progress-row">
              <div
                className="attachment-card__progress"
                role="progressbar"
                aria-label={t("attachment.uploadProgress")}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
              >
                <span
                  className="attachment-card__progress-bar"
                  style={{ transform: `scaleX(${percent / 100})` }}
                />
              </div>
              <span className="attachment-card__progress-text type-numeric">
                {t("attachment.uploading", { percent })}
              </span>
            </div>
          ) : null}

          {status === "failed" ? (
            <p className="attachment-card__error" role="alert">
              {errorMessage || t("attachment.uploadFailed")}
            </p>
          ) : null}

          {downloadError ? (
            <p className="attachment-card__error" role="alert">
              {downloadError}
            </p>
          ) : null}
        </div>

        <div className="attachment-card__actions">
          {status === "failed" && onRetry ? (
            <button
              type="button"
              className="attachment-card__action attachment-card__action--retry"
              onClick={onRetry}
            >
              <RefreshCw aria-hidden="true" />
              {t("attachment.retry")}
            </button>
          ) : null}

          {status === "ready" &&
          attachment.previewType === "IMAGE" &&
          attachment.previewUrl &&
          onPreview ? (
            <button
              type="button"
              className="attachment-card__action"
              onClick={onPreview}
            >
              <ImageIcon aria-hidden="true" />
              {t("attachment.preview")}
            </button>
          ) : null}

          {status === "ready" && onDownload ? (
            <button
              type="button"
              className="attachment-card__action"
              onClick={() => void handleDownload()}
              disabled={downloading}
              aria-busy={downloading}
            >
              {downloading ? (
                <LoaderCircle className="attachment-card__spinner" aria-hidden="true" />
              ) : (
                <Download aria-hidden="true" />
              )}
              {downloading
                ? t("attachment.downloading")
                : t("attachment.download")}
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
