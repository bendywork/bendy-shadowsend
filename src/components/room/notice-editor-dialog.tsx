"use client";

/* eslint-disable @next/next/no-img-element */
import { useRef } from "react";
import { Plus, X } from "lucide-react";
import type { NoticeEditorImage } from "@/components/room/room-page-types";
import { MAX_ANNOUNCEMENT_IMAGES } from "@/lib/constants";

type Props = {
  open: boolean;
  action: string | null;
  noticeText: string;
  noticeImages: NoticeEditorImage[];
  setNoticeText: (value: string) => void;
  addNoticeImages: (fileList: FileList | null) => void;
  removeNoticeImage: (id: string) => void;
  openImageViewer: (
    url: string | null | undefined,
    fileName: string,
  ) => void;
  previewNoticeDraft: () => void;
  saveNotice: () => Promise<void>;
  closeNoticeEditor: () => void;
};

export function NoticeEditorDialog({
  open,
  action,
  noticeText,
  noticeImages,
  setNoticeText,
  addNoticeImages,
  removeNoticeImage,
  openImageViewer,
  previewNoticeDraft,
  saveNotice,
  closeNoticeEditor,
}: Props) {
  const noticeImageInputRef = useRef<HTMLInputElement | null>(null);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-overlay-strong p-4">
      <section className="w-full max-w-lg rounded-2xl border border-line bg-canvas p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-ink">配置公告</h3>
          <button
            type="button"
            onClick={closeNoticeEditor}
            className="rounded-md border border-line p-1 text-ink-soft"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <textarea
          value={noticeText}
          onChange={(e) => setNoticeText(e.target.value)}
          placeholder="输入公告内容..."
          className="min-h-[120px] w-full rounded-xl border border-line bg-panel/80 px-3 py-2 text-sm text-ink outline-none"
        />

        <input
          ref={noticeImageInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          multiple
          onChange={(e) => {
            addNoticeImages(e.target.files);
            e.target.value = "";
          }}
        />

        <div className="mt-3">
          <div className="flex flex-wrap items-start gap-3">
            {noticeImages.map((image) => (
              <div
                key={image.id}
                className="group relative h-24 w-24 overflow-hidden rounded-xl border border-line bg-panel"
              >
                <button
                  type="button"
                  className="h-full w-full"
                  onClick={() =>
                    openImageViewer(image.imageUrl, image.imageName)
                  }
                  title="预览原图"
                >
                  <img
                    src={image.imageUrl}
                    alt={image.imageName}
                    className="h-full w-full object-cover"
                  />
                </button>
                <button
                  type="button"
                  onClick={() => removeNoticeImage(image.id)}
                  className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-line bg-overlay-strong text-ink-soft opacity-100 transition-ui hover:bg-elevated group-hover:opacity-100"
                  title="删除图片"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}

            {noticeImages.length < MAX_ANNOUNCEMENT_IMAGES ? (
              <button
                type="button"
                onClick={() => noticeImageInputRef.current?.click()}
                className="flex h-24 w-24 shrink-0 flex-col items-center justify-center rounded-xl border border-dashed border-line-strong bg-panel/70 px-2 text-center text-[11px] text-ink-soft hover:bg-elevated"
              >
                <Plus className="mb-1 h-4 w-4" />
                上传公告图片
              </button>
            ) : null}
          </div>
          <p className="mt-2 text-[11px] text-ink-faint">
            最多上传 {MAX_ANNOUNCEMENT_IMAGES} 张图片
          </p>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={closeNoticeEditor}
            className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink-soft"
          >
            取消
          </button>
          <button
            type="button"
            onClick={previewNoticeDraft}
            className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink-soft hover:bg-elevated"
          >
            预览
          </button>
          <button
            type="button"
            onClick={saveNotice}
            disabled={action === "notice"}
            className="rounded-lg bg-elevated-strong px-3 py-1.5 text-sm text-ink disabled:opacity-60"
          >
            {action === "notice" ? "保存中..." : "保存公告"}
          </button>
        </div>
      </section>
    </div>
  );
}
