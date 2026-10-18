"use client";

/* eslint-disable @next/next/no-img-element */
import type { ReactNode } from "react";
import clsx from "clsx";
import { Copy } from "lucide-react";
import { Avatar } from "@/components/chat/avatar";
import { formatBytes } from "@/lib/client";
import {
  MESSAGE_COLLAPSE_CHAR_THRESHOLD,
  formatRoomTime,
  hasInlinePreview,
} from "@/lib/room-page";
import type { AttachmentItem } from "@/types/chat";

export type BubbleAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  previewType: AttachmentItem["previewType"];
  previewUrl?: string | null;
};

export function MessageAttachmentCard({
  attachment,
  onOpenImage,
  action,
}: {
  attachment: BubbleAttachment;
  onOpenImage: (url: string | null | undefined, fileName: string) => void;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line bg-panel/80 p-2.5">
      {hasInlinePreview(attachment) ? (
        <div className="mb-2 overflow-hidden rounded-lg border border-line bg-media">
          {attachment.previewType === "IMAGE" ? (
            <img
              src={attachment.previewUrl ?? ""}
              alt={attachment.fileName}
              className="max-h-[360px] w-full cursor-zoom-in object-contain"
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
              className="max-h-[360px] w-full"
            />
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-ink-soft">{attachment.fileName}</p>
          <p className="text-xs text-ink-faint">
            {attachment.mimeType} · {formatBytes(attachment.sizeBytes)}
          </p>
        </div>
        {action ?? null}
      </div>
    </div>
  );
}

export function MessageBubble({
  own,
  avatarInitial,
  avatarColor,
  nickname,
  createdAt,
  metaSlot,
  content,
  collapsed,
  visibleContent,
  onToggleExpand,
  onCopy,
  copied,
  labels,
  attachments,
  renderAttachmentAction,
  onOpenImage,
  footerSlot,
}: {
  own: boolean;
  avatarInitial: string;
  avatarColor: string;
  nickname: string;
  createdAt: string;
  metaSlot?: ReactNode;
  content: string;
  collapsed: boolean;
  visibleContent: string;
  onToggleExpand: () => void;
  onCopy: () => void;
  copied: boolean;
  labels: { copy: string; copied: string; expand: string; collapse: string };
  attachments: BubbleAttachment[];
  renderAttachmentAction?: (attachment: BubbleAttachment) => ReactNode;
  onOpenImage: (url: string | null | undefined, fileName: string) => void;
  footerSlot?: ReactNode;
}) {
  return (
    <article className={clsx("flex", own ? "justify-end" : "justify-start")}>
      <div
        className={clsx(
          "w-full max-w-[92%] rounded-2xl border p-3 shadow-sm sm:max-w-[85%]",
          own
            ? "border-action-border bg-action-soft"
            : "border-line-subtle bg-panel/60",
        )}
      >
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Avatar
              initial={avatarInitial}
              color={avatarColor}
              className="h-7 w-7"
            />
            <span className="text-sm font-medium text-ink-soft">{nickname}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-ink-faint">
            <time className="tabular-nums">{formatRoomTime(createdAt)}</time>
            {metaSlot}
          </div>
        </div>

        {content ? (
          <div className="space-y-2">
            <p className="whitespace-pre-wrap break-words text-sm leading-6 text-ink">
              {visibleContent}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onCopy}
                className={clsx(
                  "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-ui",
                  copied
                    ? "border-action-border bg-action-soft text-ink"
                    : "border-line text-ink-soft hover:bg-elevated",
                )}
              >
                <Copy className="h-3 w-3" />
                {copied ? labels.copied : labels.copy}
              </button>
              {content.length > MESSAGE_COLLAPSE_CHAR_THRESHOLD ? (
                <button
                  type="button"
                  onClick={onToggleExpand}
                  className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] text-ink-soft hover:bg-elevated"
                >
                  {collapsed ? labels.expand : labels.collapse}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {attachments.length ? (
          <div className="mt-3 space-y-2">
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

        {footerSlot}
      </div>
    </article>
  );
}
