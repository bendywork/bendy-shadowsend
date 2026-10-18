"use client";

import { useEffect, useRef, useState } from "react";
import type {
  NoticeEditorImage,
  NoticePreviewState,
} from "@/components/room/room-page-types";
import { apiFetch } from "@/lib/client";
import { toast } from "@/lib/toast-store";
import { toastError } from "@/lib/feedback";
import { useT } from "@/lib/i18n/context";
import { MAX_ANNOUNCEMENT_IMAGES } from "@/lib/constants";
import type { ProxyUploadResult } from "@/lib/room-upload";
import type { RoomSnapshot } from "@/types/chat";

type Params = {
  roomCode: string;
  snap: RoomSnapshot | null;
  setSnap: React.Dispatch<React.SetStateAction<RoomSnapshot | null>>;
  upload: (
    file: File,
    onProgress?: (percent: number) => void,
  ) => Promise<ProxyUploadResult>;
  refresh: () => Promise<void>;
  setAction: React.Dispatch<React.SetStateAction<string | null>>;
  setShowNoticePopup: React.Dispatch<React.SetStateAction<boolean>>;
};

export function useRoomAnnouncement({
  roomCode,
  snap,
  setSnap,
  upload,
  refresh,
  setAction,
  setShowNoticePopup,
}: Params) {
  const t = useT();
  const [showNoticeEditor, setShowNoticeEditor] = useState(false);
  const [noticeText, setNoticeText] = useState("");
  const [noticeImages, setNoticeImages] = useState<NoticeEditorImage[]>([]);
  const [noticePreview, setNoticePreview] = useState<NoticePreviewState | null>(
    null,
  );
  const noticeImagesRef = useRef<NoticeEditorImage[]>([]);

  useEffect(() => {
    noticeImagesRef.current = noticeImages;
  }, [noticeImages]);

  useEffect(() => {
    return () => {
      noticeImagesRef.current.forEach((item) => {
        if (item.kind === "new" && item.imageUrl.startsWith("blob:")) {
          URL.revokeObjectURL(item.imageUrl);
        }
      });
    };
  }, []);

  function releaseNoticeEditorImages(items: NoticeEditorImage[]) {
    items.forEach((item) => {
      if (item.kind === "new" && item.imageUrl.startsWith("blob:")) {
        URL.revokeObjectURL(item.imageUrl);
      }
    });
  }

  function closeNoticeEditor() {
    setShowNoticeEditor(false);
    setNoticePreview(null);
    setNoticeText("");
    setNoticeImages((prev) => {
      releaseNoticeEditorImages(prev);
      return [];
    });
  }

  function removeNoticeImage(id: string) {
    setNoticeImages((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target?.kind === "new" && target.imageUrl.startsWith("blob:")) {
        URL.revokeObjectURL(target.imageUrl);
      }
      return prev.filter((item) => item.id !== id);
    });
  }

  function addNoticeImages(fileList: FileList | null) {
    if (!fileList) return;

    const selected = Array.from(fileList).filter((file) =>
      file.type.startsWith("image/"),
    );
    if (selected.length === 0) return;

    const remaining = MAX_ANNOUNCEMENT_IMAGES - noticeImages.length;
    if (remaining <= 0) {
      toast.warning(
        t("toast.noticeImageLimit", { max: MAX_ANNOUNCEMENT_IMAGES }),
      );
      return;
    }

    const accepted = selected.slice(0, remaining);
    if (accepted.length < selected.length) {
      toast.info(
        t("toast.noticeImageTrimmed", { max: MAX_ANNOUNCEMENT_IMAGES }),
      );
    }

    const addedItems = accepted.map((file, index) => ({
      id: `notice-new-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
      kind: "new" as const,
      imageUrl: URL.createObjectURL(file),
      imageName: file.name,
      file,
    }));

    setNoticeImages((prev) => [...prev, ...addedItems]);
  }

  function openNoticeEditor() {
    if (!snap) return;
    setNoticeText(snap.announcement.text ?? "");
    setNoticePreview(null);
    setShowNoticePopup(false);
    setNoticeImages((prev) => {
      releaseNoticeEditorImages(prev);
      return (snap.announcement.images ?? []).map((item, index) => ({
        id: `notice-existing-${index}`,
        kind: "existing" as const,
        imageUrl: item.imageUrl,
        imageName: item.imageName ?? `announcement-${index + 1}`,
        existingIndex: index,
      }));
    });
    setShowNoticeEditor(true);
  }

  function openNoticeViewer() {
    if (!snap) return;
    const hasNoticeContent = Boolean(
      snap.announcement.text || snap.announcement.images.length > 0,
    );
    if (!hasNoticeContent) {
      toast.info(t("toast.noNotice"));
      return;
    }
    setNoticePreview(null);
    setShowNoticePopup(true);
  }

  function previewNoticeDraft() {
    if (!snap) return;
    const draftText = noticeText.trim() || null;
    const draftImages = noticeImages.map((image) => ({
      imageUrl: image.imageUrl,
      imageName: image.imageName,
    }));

    if (!draftText && draftImages.length === 0) {
      toast.warning(t("toast.noticeEmpty"));
      return;
    }

    setNoticePreview({
      text: draftText,
      images: draftImages,
    });
    setShowNoticePopup(true);
  }

  async function saveNotice() {
    setAction("notice");
    try {
      const keepImageIndexes = noticeImages
        .filter((image) => image.kind === "existing")
        .map((image) => image.existingIndex)
        .filter((index): index is number => typeof index === "number");

      const newNoticeFiles = noticeImages
        .filter((image) => image.kind === "new" && image.file)
        .map((image) => image.file as File);

      const uploadedNewImages = await Promise.all(
        newNoticeFiles.map((file) => upload(file)),
      );

      await apiFetch<{ announcement: unknown }>(
        `/api/rooms/${roomCode}/announcement`,
        {
          method: "POST",
          body: JSON.stringify({
            text: noticeText || undefined,
            keepImageIndexes,
            newImages: uploadedNewImages.map((image) => ({
              s3Key: image.s3Key,
              fileName: image.fileName,
              mimeType: image.mimeType,
              sizeBytes: image.sizeBytes,
              storage: image.storage,
            })),
          }),
        },
      );
      closeNoticeEditor();
      await refresh();
      toast.success(t("toast.noticeUpdated"));
    } catch (err) {
      toastError(err, t("toast.noticeSaveFailed"), t);
    } finally {
      setAction(null);
    }
  }

  async function closeNoticePopup() {
    if (noticePreview) {
      setNoticePreview(null);
      setShowNoticePopup(false);
      return;
    }

    if (!snap?.announcement.showToMe) {
      setShowNoticePopup(false);
      return;
    }

    try {
      await apiFetch<{ success: boolean }>(
        `/api/rooms/${roomCode}/announcement/seen`,
        { method: "POST", body: JSON.stringify({}) },
      );
      setSnap((prev) =>
        prev
          ? {
              ...prev,
              announcement: { ...prev.announcement, showToMe: false },
            }
          : prev,
      );
      setShowNoticePopup(false);
    } catch (err) {
      toastError(err, t("toast.noticeSeenFailed"), t);
    }
  }

  return {
    showNoticeEditor,
    setShowNoticeEditor,
    noticeText,
    setNoticeText,
    noticeImages,
    noticePreview,
    setNoticePreview,
    addNoticeImages,
    removeNoticeImage,
    openNoticeEditor,
    closeNoticeEditor,
    openNoticeViewer,
    previewNoticeDraft,
    saveNotice,
    closeNoticePopup,
  };
}
