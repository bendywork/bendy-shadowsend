"use client";

/* eslint-disable @next/next/no-img-element */
import clsx from "clsx";
import { Megaphone } from "lucide-react";
import type { NoticePreviewState } from "@/components/room/room-page-types";

type Props = {
  open: boolean;
  content: NoticePreviewState;
  isPreviewingDraft: boolean;
  openImageViewer: (
    url: string | null | undefined,
    fileName: string,
  ) => void;
  onClose: () => Promise<void>;
};

export function NoticeViewerDialog({
  open,
  content,
  isPreviewingDraft,
  openImageViewer,
  onClose,
}: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-overlay-strong p-4">
      <section className="w-full max-w-lg rounded-2xl border border-line-strong bg-canvas p-5">
        <div className="mb-3 flex items-center gap-2 text-ink-soft">
          <Megaphone className="h-5 w-5" />
          <h3 className="text-base font-semibold">
            {isPreviewingDraft ? "公告预览" : "房间公告"}
          </h3>
        </div>
        {content.text ? (
          <p className="whitespace-pre-wrap text-sm leading-6 text-ink">
            {content.text}
          </p>
        ) : null}
        {content.images.length > 0 ? (
          <div
            className={clsx(
              "mt-3 grid gap-3",
              content.images.length === 1
                ? "grid-cols-1"
                : "grid-cols-1 sm:grid-cols-2",
            )}
          >
            {content.images.map((image, index) => (
              <button
                key={`${image.imageUrl}-${index}`}
                type="button"
                onClick={() =>
                  openImageViewer(
                    image.imageUrl,
                    image.imageName ?? `announcement-${index + 1}`,
                  )
                }
                className="overflow-hidden rounded-lg border border-line bg-media"
              >
                <img
                  src={image.imageUrl}
                  alt={image.imageName ?? "announcement"}
                  className="max-h-[42vh] w-full object-contain"
                />
              </button>
            ))}
          </div>
        ) : null}
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-elevated-strong px-3 py-1.5 text-sm text-ink"
          >
            {isPreviewingDraft ? "关闭预览" : "我知道了"}
          </button>
        </div>
      </section>
    </div>
  );
}
