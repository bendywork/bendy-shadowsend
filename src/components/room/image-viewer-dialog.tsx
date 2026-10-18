"use client";

/* eslint-disable @next/next/no-img-element */
import type { ImageViewerState } from "@/components/room/room-page-types";

type Props = {
  imageViewer: ImageViewerState | null;
  onClose: () => void;
};

export function ImageViewerDialog({ imageViewer, onClose }: Props) {
  if (!imageViewer) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay-strong p-4"
      onClick={onClose}
    >
      <section
        className="w-full max-w-5xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="truncate text-xs text-ink-soft">
            {imageViewer.fileName}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-line px-2 py-1 text-xs text-ink-soft hover:bg-elevated"
          >
            关闭
          </button>
        </div>
        <img
          src={imageViewer.url}
          alt={imageViewer.fileName}
          className="max-h-[80vh] w-full rounded-lg border border-line bg-media object-contain"
        />
      </section>
    </div>
  );
}
