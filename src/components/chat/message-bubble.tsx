"use client";

/* eslint-disable @next/next/no-img-element */
import clsx from "clsx";
import {
  Check,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  Copy,
  LoaderCircle,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { Avatar } from "@/components/chat/avatar";
import { formatBytes } from "@/lib/client";
import { useLanguage } from "@/lib/i18n/context";
import {
  formatMessageTime,
  type MessageGroupPosition,
} from "@/lib/message-bubble";
import type { AttachmentItem, ClientUser } from "@/types/chat";

export type MessageBubbleStatus =
  | "received"
  | "sent"
  | "read"
  | "sending"
  | "failed";

export type BubbleAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  previewType: AttachmentItem["previewType"];
  previewUrl?: string | null;
};

type MessageBubbleProps = {
  own: boolean;
  sender: ClientUser;
  createdAt: string;
  status: MessageBubbleStatus;
  progress?: number;
  error?: string | null;
  groupPosition: MessageGroupPosition;
  content: string;
  visibleContent: string;
  collapsed: boolean;
  canToggleExpand: boolean;
  onToggleExpand: () => void;
  onCopy: () => void;
  copied: boolean;
  attachments: BubbleAttachment[];
  renderAttachmentAction?: (attachment: BubbleAttachment) => ReactNode;
  onOpenImage: (url: string | null | undefined, fileName: string) => void;
  onRetry?: () => void;
};

const isPreviewable = (attachment: { previewType: BubbleAttachment["previewType"] }) =>
  attachment.previewType === "IMAGE" || attachment.previewType === "VIDEO";

const hasInlinePreview = (attachment: BubbleAttachment) =>
  isPreviewable(attachment) && Boolean(attachment.previewUrl);

function MessageAttachmentCard({
  attachment,
  onOpenImage,
  action,
}: {
  attachment: BubbleAttachment;
  onOpenImage: (url: string | null | undefined, fileName: string) => void;
  action?: ReactNode;
}) {
  return (
    <div className="message-attachment">
      {hasInlinePreview(attachment) ? (
        <div className="message-attachment__preview">
          {attachment.previewType === "IMAGE" ? (
            <img
              src={attachment.previewUrl ?? ""}
              alt={attachment.fileName}
              className="message-attachment__image"
              loading="lazy"
              onDoubleClick={() =>
                onOpenImage(attachment.previewUrl, attachment.fileName)
              }
            />
          ) : attachment.previewType === "VIDEO" ? (
            <video
              src={attachment.previewUrl ?? ""}
              controls
              preload="metadata"
              className="message-attachment__video"
            />
          ) : null}
        </div>
      ) : null}

      <div className="message-attachment__meta">
        <div className="message-attachment__text">
          <p className="message-attachment__name">{attachment.fileName}</p>
          <p className="message-attachment__detail">
            {attachment.mimeType} · {formatBytes(attachment.sizeBytes)}
          </p>
        </div>
        {action ?? null}
      </div>
    </div>
  );
}

function MessageStatus({
  status,
  progress,
  onRetry,
}: {
  status: MessageBubbleStatus;
  progress?: number;
  onRetry?: () => void;
}) {
  const { t } = useLanguage();

  if (status === "sending") {
    const percent = Math.min(100, Math.max(0, progress ?? 0));
    return (
      <span
        className="message-status message-status--sending"
        role="status"
        aria-live="polite"
      >
        <LoaderCircle
          className="message-status__icon motion-reduce:animate-none"
          aria-hidden
        />
        <span>
          {t("chat.sending")} {percent}%
        </span>
      </span>
    );
  }

  if (status === "failed") {
    return (
      <span className="message-status message-status--failed">
        <X className="message-status__icon" aria-hidden />
        <span>{t("chat.sendFailed")}</span>
        {onRetry ? (
          <button type="button" className="message-retry" onClick={onRetry}>
            {t("common.retry")}
          </button>
        ) : null}
      </span>
    );
  }

  if (status === "read") {
    return (
      <span className="message-status message-status--read">
        <CheckCheck className="message-status__icon" aria-hidden />
        <span>{t("chat.delivery.read")}</span>
      </span>
    );
  }

  if (status === "sent") {
    return (
      <span className="message-status">
        <Check className="message-status__icon" aria-hidden />
        <span>{t("chat.delivery.sent")}</span>
      </span>
    );
  }

  return null;
}

function MessageActions({
  hasContent,
  copied,
  canToggleExpand,
  collapsed,
  onCopy,
  onToggleExpand,
}: {
  hasContent: boolean;
  copied: boolean;
  canToggleExpand: boolean;
  collapsed: boolean;
  onCopy: () => void;
  onToggleExpand: () => void;
}) {
  const { t } = useLanguage();
  if (!hasContent && !canToggleExpand) return null;

  return (
    <div className="message-actions">
      {hasContent ? (
        <button
          type="button"
          className={clsx("message-action", copied && "message-action--copied")}
          onClick={onCopy}
          aria-label={copied ? t("chat.copied") : t("chat.copy")}
          title={copied ? t("chat.copied") : t("chat.copy")}
        >
          <Copy className="message-action__icon" aria-hidden />
        </button>
      ) : null}
      {canToggleExpand ? (
        <button
          type="button"
          className="message-action"
          onClick={onToggleExpand}
          aria-label={collapsed ? t("chat.expand") : t("chat.collapse")}
          title={collapsed ? t("chat.expand") : t("chat.collapse")}
        >
          {collapsed ? (
            <ChevronDown className="message-action__icon" aria-hidden />
          ) : (
            <ChevronUp className="message-action__icon" aria-hidden />
          )}
        </button>
      ) : null}
    </div>
  );
}

function MessageMeta({
  own,
  status,
  progress,
  createdAt,
  hasContent,
  canToggleExpand,
  collapsed,
  copied,
  onCopy,
  onToggleExpand,
  onRetry,
}: {
  own: boolean;
  status: MessageBubbleStatus;
  progress?: number;
  createdAt: string;
  hasContent: boolean;
  canToggleExpand: boolean;
  collapsed: boolean;
  copied: boolean;
  onCopy: () => void;
  onToggleExpand: () => void;
  onRetry?: () => void;
}) {
  const { lang } = useLanguage();
  return (
    <div className="message-meta" data-own={own ? "true" : "false"}>
      <time dateTime={createdAt} suppressHydrationWarning>
        {formatMessageTime(createdAt, lang)}
      </time>
      {own ? (
        <MessageStatus status={status} progress={progress} onRetry={onRetry} />
      ) : null}
      <MessageActions
        hasContent={hasContent}
        copied={copied}
        canToggleExpand={canToggleExpand}
        collapsed={collapsed}
        onCopy={onCopy}
        onToggleExpand={onToggleExpand}
      />
    </div>
  );
}

export function MessageBubble({
  own,
  sender,
  createdAt,
  status,
  progress,
  error,
  groupPosition,
  content,
  visibleContent,
  collapsed,
  canToggleExpand,
  onToggleExpand,
  onCopy,
  copied,
  attachments,
  renderAttachmentAction,
  onOpenImage,
  onRetry,
}: MessageBubbleProps) {
  const isGroupStart = groupPosition === "first" || groupPosition === "single";
  const showMeta =
    groupPosition === "single" ||
    groupPosition === "last" ||
    status === "sending" ||
    status === "failed";

  return (
    <article
      className="message-row"
      data-own={own ? "true" : "false"}
      data-status={status}
      data-group-position={groupPosition}
    >
      {!own ? (
        isGroupStart ? (
          <Avatar
            initial={sender.avatarInitial}
            color={sender.avatarColor}
            className="message-avatar"
          />
        ) : (
          <span className="message-avatar-spacer" aria-hidden />
        )
      ) : null}

      <div className="message-body">
        {!own && isGroupStart ? (
          <div className="message-sender">{sender.nickname}</div>
        ) : null}

        <div
          className="message-bubble"
          data-own={own ? "true" : "false"}
          data-status={status}
          data-group-position={groupPosition}
        >
          {content ? (
            <div className="message-content">
              <p className="message-text">{visibleContent}</p>
            </div>
          ) : null}

          {attachments.length ? (
            <div className="message-attachments">
              {attachments.map((attachment) => (
                <MessageAttachmentCard
                  key={attachment.id}
                  attachment={attachment}
                  onOpenImage={onOpenImage}
                  action={renderAttachmentAction?.(attachment)}
                />
              ))}
            </div>
          ) : null}

          {status === "sending" ? (
            <div className="message-progress" aria-hidden="true">
              <span
                style={{
                  transform: `scaleX(${Math.min(100, Math.max(0, progress ?? 0)) / 100})`,
                }}
              />
            </div>
          ) : null}
        </div>

        {showMeta ? (
          <MessageMeta
            own={own}
            status={status}
            progress={progress}
            createdAt={createdAt}
            hasContent={Boolean(content)}
            canToggleExpand={canToggleExpand}
            collapsed={collapsed}
            copied={copied}
            onCopy={onCopy}
            onToggleExpand={onToggleExpand}
            onRetry={onRetry}
          />
        ) : null}

        {status === "failed" && error ? (
          <p className="message-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </article>
  );
}
