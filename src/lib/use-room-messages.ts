"use client";

import {
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type {
  PendingAttachment,
  PendingMessage,
} from "@/components/room/room-page-types";
import { apiFetch } from "@/lib/client";
import { toast } from "@/lib/toast-store";
import { resolveErrorMessage } from "@/lib/feedback";
import { useT } from "@/lib/i18n/context";
import { MAX_MESSAGE_TEXT_CHARS } from "@/lib/constants";
import {
  MAX_FILES_PER_MESSAGE,
  guessPreviewType,
  mergeIncomingMessages,
} from "@/lib/room-page";
import type { ProxyUploadResult } from "@/lib/room-upload";
import type { MessageItem, RoomSnapshot } from "@/types/chat";

type Params = {
  roomCode: string;
  snap: RoomSnapshot | null;
  setSnap: React.Dispatch<React.SetStateAction<RoomSnapshot | null>>;
  upload: (
    file: File,
    onProgress?: (percent: number) => void,
  ) => Promise<ProxyUploadResult>;
  pollLatestMessages: () => Promise<void>;
  latestMessageAtRef: RefObject<string | null>;
};

export function useRoomMessages({
  roomCode,
  snap,
  setSnap,
  upload,
  pollLatestMessages,
  latestMessageAtRef,
}: Params) {
  const t = useT();
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [pendingMessages, setPendingMessages] = useState<PendingMessage[]>([]);
  const [enterToSend, setEnterToSend] = useState(true);
  const [expandedMessageIds, setExpandedMessageIds] = useState<
    Record<string, boolean>
  >({});
  const [expandedPendingMessageIds, setExpandedPendingMessageIds] = useState<
    Record<string, boolean>
  >({});
  const [copiedTextKeys, setCopiedTextKeys] = useState<Record<string, boolean>>(
    {},
  );
  const composerFormRef = useRef<HTMLFormElement | null>(null);
  const copyTextTimerRef = useRef<Record<string, number>>({});
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [snap?.messages.length, pendingMessages.length]);

  useEffect(() => {
    const timerMap = copyTextTimerRef.current;
    return () => {
      Object.values(timerMap).forEach((timer) => {
        window.clearTimeout(timer);
      });
    };
  }, []);

  const clampMessageText = useCallback(
    (value: string) => value.slice(0, MAX_MESSAGE_TEXT_CHARS),
    [],
  );

  const appendMessageText = useCallback(
    (incoming: string) => {
      const normalized = incoming.trim();
      if (!normalized) return;
      setText((prev) =>
        clampMessageText(prev ? `${prev}\n${normalized}` : normalized),
      );
    },
    [clampMessageText],
  );

  function addFiles(input: FileList | File[]) {
    const incoming = Array.from(input);
    if (!incoming.length) return;
    if (files.length + incoming.length > MAX_FILES_PER_MESSAGE) {
      toast.warning(
        t("toast.fileLimit", { max: MAX_FILES_PER_MESSAGE }),
      );
    }
    setFiles((prev) =>
      [...prev, ...incoming].slice(0, MAX_FILES_PER_MESSAGE),
    );
  }

  async function readClipboard() {
    if (!navigator.clipboard) {
      toast.warning(t("toast.clipboardUnavailable"));
      return;
    }
    try {
      if (navigator.clipboard.read) {
        const items = await navigator.clipboard.read();
        const clipboardFiles: File[] = [];
        const textChunks: string[] = [];
        let fileCounter = 0;

        for (const item of items) {
          const fileLikeTypes = item.types.filter(
            (type) => !type.startsWith("text/"),
          );

          if (fileLikeTypes.length > 0) {
            let preferredName: string | null = null;
            if (item.types.includes("text/plain")) {
              try {
                const nameBlob = await item.getType("text/plain");
                const nameText = (await nameBlob.text()).trim();
                if (nameText && !nameText.includes("\n")) {
                  preferredName =
                    nameText.split(/[\\/]/).pop() ?? nameText;
                }
              } catch {
                preferredName = null;
              }
            }

            for (const type of fileLikeTypes) {
              try {
                const blob = await item.getType(type);
                const safeType =
                  blob.type ||
                  (type.includes("/") ? type : "application/octet-stream");
                const defaultName = `clipboard-file-${Date.now()}-${fileCounter + 1}`;
                const rawName = preferredName ?? defaultName;
                const safeName = rawName.replace(
                  /[<>:"/\\|?*\x00-\x1F]/g,
                  "_",
                );
                const ext = safeType.includes("/")
                  ? (safeType.split("/")[1]?.split(";")[0] ?? "")
                  : "";
                const finalName =
                  safeName.includes(".") || !ext
                    ? safeName
                    : `${safeName}.${ext}`;

                clipboardFiles.push(
                  new File([blob], finalName, { type: safeType }),
                );
                fileCounter += 1;
              } catch {
                // Ignore unsupported clipboard entry types.
              }
            }

            // If current clipboard item already contains file data, ignore its text payload.
            continue;
          }

          for (const type of item.types) {
            if (!type.startsWith("text/")) continue;
            try {
              const blob = await item.getType(type);
              const text = (await blob.text()).trim();
              if (text) textChunks.push(text);
            } catch {
              // Ignore unavailable text entry types.
            }
          }
        }

        if (clipboardFiles.length > 0) {
          addFiles(clipboardFiles);
          return;
        }

        if (textChunks.length > 0) {
          const mergedText = Array.from(new Set(textChunks)).join("\n");
          if (mergedText.trim()) {
            appendMessageText(mergedText);
          }
        }
      } else {
        const clipboardText = await navigator.clipboard.readText();
        appendMessageText(clipboardText);
      }
    } catch {
      toast.error(t("toast.clipboardReadFailed"));
    }
  }

  function onPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const pastedFiles: File[] = [];
    for (const item of event.clipboardData.items) {
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file) pastedFiles.push(file);
      }
    }
    if (pastedFiles.length) {
      addFiles(pastedFiles);
      event.preventDefault();
    }
  }

  function onComposerKeyDown(
    event: ReactKeyboardEvent<HTMLTextAreaElement>,
  ) {
    if (!enterToSend) return;
    if (event.key !== "Enter") return;
    if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    if (event.nativeEvent.isComposing) return;

    event.preventDefault();
    composerFormRef.current?.requestSubmit();
  }

  function updatePendingMessage(
    localId: string,
    patch: Partial<PendingMessage>,
  ) {
    setPendingMessages((prev) =>
      prev.map((item) =>
        item.localId === localId ? { ...item, ...patch } : item,
      ),
    );
  }

  async function runSend(
    localId: string,
    content: string,
    sendingFiles: File[],
  ) {
    try {
      let attachments: ProxyUploadResult[] = [];

      if (sendingFiles.length > 0) {
        const totalBytes = sendingFiles.reduce(
          (sum, file) => sum + file.size,
          0,
        );
        const loadedBytesMap = new Map<number, number>();

        attachments = await Promise.all(
          sendingFiles.map((file, index) =>
            upload(file, (percent) => {
              if (totalBytes <= 0) {
                updatePendingMessage(localId, { progress: percent });
                return;
              }

              const loadedBytes = Math.round((file.size * percent) / 100);
              loadedBytesMap.set(index, loadedBytes);
              const loadedTotal = Array.from(
                loadedBytesMap.values(),
              ).reduce((sum, value) => sum + value, 0);
              const progress = Math.min(
                99,
                Math.round((loadedTotal / totalBytes) * 100),
              );
              updatePendingMessage(localId, { progress });
            }),
          ),
        );
      }

      updatePendingMessage(localId, { progress: 99 });

      const result = await apiSendMessage(content, attachments);
      setPendingMessages((prev) =>
        prev.filter((item) => item.localId !== localId),
      );
      setSnap((prev) => {
        if (!prev) return prev;
        return mergeIncomingMessages(prev, [result.message]);
      });
      latestMessageAtRef.current = result.message.createdAt;
      // Extra sync after a previously failed send, to keep UI and server state aligned.
      void pollLatestMessages().catch(() => undefined);
    } catch (error) {
      const message = resolveErrorMessage(
        error,
        t("toast.sendFailed"),
        t,
      );
      updatePendingMessage(localId, {
        status: "failed",
        error: message,
      });
      toast.error(message);
    }

    async function apiSendMessage(
      content: string,
      attachments: ProxyUploadResult[],
    ) {
      return apiFetch<{ message: MessageItem }>(
        `/api/rooms/${roomCode}/messages`,
        {
          method: "POST",
          body: JSON.stringify({
            content: content || undefined,
            attachments: attachments.map((attachment) => ({
              fileName: attachment.fileName,
              mimeType: attachment.mimeType,
              sizeBytes: attachment.sizeBytes,
              s3Key: attachment.s3Key,
              storage: attachment.storage,
            })),
          }),
        },
      );
    }
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = text.trim();
    const sendingFiles = [...files];
    if (!content && sendingFiles.length === 0) return;

    const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const pendingAttachments: PendingAttachment[] = sendingFiles.map(
      (file, index) => ({
        id: `${localId}-${index}`,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        previewType: guessPreviewType(
          file.type || "application/octet-stream",
        ),
        previewUrl:
          (file.type || "").startsWith("image/") ||
          (file.type || "").startsWith("video/")
            ? URL.createObjectURL(file)
            : null,
      }),
    );

    setPendingMessages((prev) => [
      ...prev.filter((item) => item.status === "sending"),
      {
        localId,
        createdAt: new Date().toISOString(),
        content,
        attachments: pendingAttachments,
        progress: 0,
        status: "sending",
      },
    ]);

    setText("");
    setFiles([]);

    void runSend(localId, content, sendingFiles);
  }

  function markTextCopied(feedbackKey: string) {
    setCopiedTextKeys((prev) => ({
      ...prev,
      [feedbackKey]: true,
    }));

    const existingTimer = copyTextTimerRef.current[feedbackKey];
    if (existingTimer) {
      window.clearTimeout(existingTimer);
    }

    copyTextTimerRef.current[feedbackKey] = window.setTimeout(() => {
      setCopiedTextKeys((prev) => {
        const next = { ...prev };
        delete next[feedbackKey];
        return next;
      });
      delete copyTextTimerRef.current[feedbackKey];
    }, 1400);
  }

  async function copyMessageText(content: string, feedbackKey: string) {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      markTextCopied(feedbackKey);
      toast.success(t("toast.copied"));
    } catch {
      toast.error(t("toast.copyFailed"));
    }
  }

  function toggleMessageExpanded(messageId: string, expanded: boolean) {
    setExpandedMessageIds((prev) => ({
      ...prev,
      [messageId]: !expanded,
    }));
  }

  function togglePendingExpanded(localId: string, expanded: boolean) {
    setExpandedPendingMessageIds((prev) => ({
      ...prev,
      [localId]: !expanded,
    }));
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, fileIndex) => fileIndex !== index));
  }

  function toggleEnterToSend() {
    setEnterToSend((prev) => !prev);
  }

  return {
    text,
    setText,
    clampMessageText,
    files,
    addFiles,
    removeFile,
    enterToSend,
    toggleEnterToSend,
    pendingMessages,
    expandedMessageIds,
    expandedPendingMessageIds,
    copiedTextKeys,
    composerFormRef,
    endRef,
    appendMessageText,
    readClipboard,
    onPaste,
    onComposerKeyDown,
    send,
    copyMessageText,
    toggleMessageExpanded,
    togglePendingExpanded,
  };
}
