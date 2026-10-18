"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useId, useRef, useState } from "react";
import { ImagePlus, LoaderCircle, Megaphone, X } from "lucide-react";
import { Drawer } from "@/components/ui/drawer";
import {
  MAX_ANNOUNCEMENT_IMAGES,
  MAX_ANNOUNCEMENT_IMAGE_BYTES,
  MAX_ANNOUNCEMENT_TEXT_CHARS,
} from "@/lib/constants";
import {
  buildAnnouncementSaveInput,
  createAnnouncementEditorImages,
  removeAnnouncementEditorImage,
  selectAnnouncementImageFiles,
  validateAnnouncementDraft,
  type AnnouncementEditorImage,
  type AnnouncementImageSource,
  type AnnouncementSaveInput,
} from "@/lib/announcement-editor";
import { useT } from "@/lib/i18n/context";
import { toast } from "@/lib/toast-store";

const MAX_ANNOUNCEMENT_IMAGE_MB = Math.floor(
  MAX_ANNOUNCEMENT_IMAGE_BYTES / 1024 / 1024,
);

type AnnouncementEditorProps = {
  initialText: string;
  initialImages: readonly AnnouncementImageSource[];
  saving: boolean;
  saveError: string | null;
  onClose: () => void;
  onClearSaveError: () => void;
  onSave: (input: AnnouncementSaveInput) => void;
  onPreviewImage: (url: string, fileName: string) => void;
};

function releaseImageUrls(images: readonly AnnouncementEditorImage[]) {
  images.forEach((image) => {
    if (image.kind === "new" && image.imageUrl.startsWith("blob:")) {
      URL.revokeObjectURL(image.imageUrl);
    }
  });
}

export function AnnouncementEditor({
  initialText,
  initialImages,
  saving,
  saveError,
  onClose,
  onClearSaveError,
  onSave,
  onPreviewImage,
}: AnnouncementEditorProps) {
  const t = useT();
  const [text, setText] = useState(initialText);
  const [images, setImages] = useState<AnnouncementEditorImage[]>(() =>
    createAnnouncementEditorImages(initialImages),
  );
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [localError, setLocalError] = useState<string | null>(null);

  const textId = useId();
  const textHintId = useId();
  const imagesLabelId = useId();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const backButtonRef = useRef<HTMLButtonElement | null>(null);
  const imagesRef = useRef<AnnouncementEditorImage[]>(images);

  function commitImages(next: AnnouncementEditorImage[]) {
    imagesRef.current = next;
    setImages(next);
  }

  useEffect(() => {
    return () => releaseImageUrls(imagesRef.current);
  }, []);

  // 切换编辑/预览时把焦点带到当前可见区域，避免原焦点节点卸载后
  // Tab 键从抽屉外部继续。
  useEffect(() => {
    if (mode === "preview") {
      backButtonRef.current?.focus();
    } else {
      textareaRef.current?.focus();
    }
  }, [mode]);

  function closeEditor() {
    if (saving) return;
    releaseImageUrls(imagesRef.current);
    imagesRef.current = [];
    onClose();
  }

  function addImages(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;

    const result = selectAnnouncementImageFiles(
      Array.from(fileList),
      images.length,
      MAX_ANNOUNCEMENT_IMAGES,
      MAX_ANNOUNCEMENT_IMAGE_BYTES,
    );

    if (result.rejectedType > 0) toast.error(t("toast.noticeImageInvalid"));
    if (result.rejectedSize > 0) {
      toast.error(t("toast.noticeImageTooLarge", { max: MAX_ANNOUNCEMENT_IMAGE_MB }));
    }
    if (result.rejectedLimit > 0) {
      toast.info(t("toast.noticeImageTrimmed", { max: MAX_ANNOUNCEMENT_IMAGES }));
    }
    if (result.accepted.length === 0) return;

    const stamp = Date.now();
    const added = result.accepted.map((file, index) => ({
      id: `announcement-new-${stamp}-${index}-${Math.random().toString(36).slice(2, 7)}`,
      kind: "new" as const,
      imageUrl: URL.createObjectURL(file),
      imageName: file.name,
      file,
    }));

    commitImages([...images, ...added]);
    setLocalError(null);
    onClearSaveError();
  }

  function removeImage(id: string) {
    const target = images.find((image) => image.id === id);
    if (target?.kind === "new" && target.imageUrl.startsWith("blob:")) {
      URL.revokeObjectURL(target.imageUrl);
    }
    commitImages(removeAnnouncementEditorImage(images, id));
    setLocalError(null);
    onClearSaveError();
  }

  function ensureDraftHasContent() {
    const validation = validateAnnouncementDraft(text, images);
    if (validation) {
      setLocalError(t(validation));
      return false;
    }
    setLocalError(null);
    return true;
  }

  function previewDraft() {
    if (!ensureDraftHasContent()) return;
    setMode("preview");
  }

  function saveDraft() {
    if (!ensureDraftHasContent()) return;
    onSave(buildAnnouncementSaveInput(text, images));
  }

  const error = localError ?? saveError;
  const title = mode === "preview"
    ? t("announcement.editor.previewTitle")
    : t("announcement.editor.title");

  const footer = mode === "preview" ? (
    <>
      <button
        ref={backButtonRef}
        type="button"
        onClick={() => setMode("edit")}
        disabled={saving}
        className="btn-secondary btn-md"
      >
        {t("announcement.editor.backToEdit")}
      </button>
      <button
        type="button"
        onClick={saveDraft}
        disabled={saving}
        aria-busy={saving}
        className="btn-primary btn-md"
      >
        {saving ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
        {saving ? t("announcement.editor.saving") : t("announcement.editor.save")}
      </button>
    </>
  ) : (
    <>
      <button
        type="button"
        onClick={closeEditor}
        disabled={saving}
        className="btn-ghost btn-md"
      >
        {t("announcement.editor.cancel")}
      </button>
      <button
        type="button"
        onClick={previewDraft}
        disabled={saving}
        className="btn-secondary btn-md"
      >
        {t("announcement.editor.preview")}
      </button>
      <button
        type="button"
        onClick={saveDraft}
        disabled={saving}
        aria-busy={saving}
        className="btn-primary btn-md"
      >
        {saving ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
        {saving ? t("announcement.editor.saving") : t("announcement.editor.save")}
      </button>
    </>
  );

  return (
    <Drawer
      open
      onClose={closeEditor}
      title={title}
      eyebrow={t("announcement.editor.eyebrow")}
      description={
        mode === "preview"
          ? t("announcement.editor.previewHint")
          : t("announcement.editor.description")
      }
      footer={footer}
      closeLabel={t("announcement.editor.close")}
      closeDisabled={saving}
      initialFocusRef={textareaRef}
      bodyClassName="announcement-editor"
    >
      {mode === "preview" ? (
        <div className="announcement-editor__preview">
          <div className="announcement-editor__preview-card">
            <div className="announcement-editor__preview-heading">
              <Megaphone className="h-4 w-4" aria-hidden="true" />
              <span>{t("announcement.view.title")}</span>
            </div>
            {text.trim() ? (
              <p className="announcement-editor__preview-text">{text}</p>
            ) : null}
            {images.length > 0 ? (
              <div className="announcement-editor__preview-grid">
                {images.map((image) => (
                  <button
                    key={image.id}
                    type="button"
                    onClick={() => onPreviewImage(image.imageUrl, image.imageName)}
                    className="announcement-editor__preview-image"
                    aria-label={`${t("announcement.editor.previewImage")}: ${image.imageName}`}
                  >
                    <img
                      src={image.imageUrl}
                      alt={t("announcement.editor.imageAlt", { name: image.imageName })}
                    />
                  </button>
                ))}
              </div>
            ) : null}
            {!text.trim() && images.length === 0 ? (
              <p className="announcement-editor__preview-empty">
                {t("announcement.editor.emptyPreview")}
              </p>
            ) : null}
          </div>
        </div>
      ) : (
        <>
          <section className="announcement-editor__section">
            <div className="announcement-editor__label-row">
              <label htmlFor={textId} className="announcement-editor__label">
                {t("announcement.editor.textLabel")}
              </label>
              <span className="announcement-editor__counter">
                {text.length}/{MAX_ANNOUNCEMENT_TEXT_CHARS}
              </span>
            </div>
            <textarea
              id={textId}
              ref={textareaRef}
              value={text}
              maxLength={MAX_ANNOUNCEMENT_TEXT_CHARS}
              onChange={(event) => {
                setText(event.target.value);
                setLocalError(null);
                onClearSaveError();
              }}
              placeholder={t("announcement.editor.textPlaceholder")}
              aria-describedby={textHintId}
              className="field announcement-editor__textarea"
            />
            <p id={textHintId} className="announcement-editor__hint">
              {t("announcement.editor.textHint", { max: MAX_ANNOUNCEMENT_TEXT_CHARS })}
            </p>
          </section>

          <section className="announcement-editor__section">
            <div className="announcement-editor__label-row">
              <span id={imagesLabelId} className="announcement-editor__label">
                {t("announcement.editor.imagesLabel")}
              </span>
              <span className="announcement-editor__counter">
                {t("announcement.editor.imagesCount", {
                  count: images.length,
                  max: MAX_ANNOUNCEMENT_IMAGES,
                })}
              </span>
            </div>
            <div
              role="group"
              aria-labelledby={imagesLabelId}
              className="announcement-editor__images"
            >
              {images.map((image) => (
                <div key={image.id} className="announcement-editor__tile">
                  <button
                    type="button"
                    onClick={() => onPreviewImage(image.imageUrl, image.imageName)}
                    className="announcement-editor__tile-preview"
                    aria-label={`${t("announcement.editor.previewImage")}: ${image.imageName}`}
                  >
                    <img
                      src={image.imageUrl}
                      alt={t("announcement.editor.imageAlt", { name: image.imageName })}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeImage(image.id)}
                    className="announcement-editor__remove"
                    aria-label={`${t("announcement.editor.removeImage")}: ${image.imageName}`}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              ))}
              {images.length < MAX_ANNOUNCEMENT_IMAGES ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="announcement-editor__add"
                  aria-label={t("announcement.editor.addImage")}
                >
                  <ImagePlus className="h-5 w-5" aria-hidden="true" />
                  <span>{t("announcement.editor.addImage")}</span>
                </button>
              ) : null}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => {
                addImages(event.target.files);
                event.target.value = "";
              }}
            />
            <p className="announcement-editor__hint">
              {t("announcement.editor.imagesHint", {
                max: MAX_ANNOUNCEMENT_IMAGES,
                size: MAX_ANNOUNCEMENT_IMAGE_MB,
              })}
            </p>
          </section>

          {saving ? (
            <p className="announcement-editor__saving" role="status">
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              {t("announcement.editor.savingHint")}
            </p>
          ) : null}
        </>
      )}
      {error ? (
        <p className="notice notice--danger" role="alert">
          {error}
        </p>
      ) : null}
    </Drawer>
  );
}
