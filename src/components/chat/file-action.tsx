"use client";

import { useState } from "react";
import { Download, LoaderCircle } from "lucide-react";
import { apiFetch } from "@/lib/client";
import { toastError } from "@/lib/feedback";
import { useT } from "@/lib/i18n/context";
import type { DownloadPayload } from "@/components/room/room-page-types";
import type { AttachmentItem } from "@/types/chat";

export function FileAction({
  roomCode,
  attachment,
  label,
}: {
  roomCode: string;
  attachment: AttachmentItem;
  label: string;
}) {
  const [loading, setLoading] = useState(false);
  const t = useT();

  async function open() {
    setLoading(true);
    try {
      const p = await apiFetch<DownloadPayload>(
        `/api/rooms/${roomCode}/attachments/${attachment.id}/download`,
      );
      window.open(p.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toastError(e, t("toast.downloadFailed"), t);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={open}
      disabled={loading}
      className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs text-ink-soft hover:bg-elevated disabled:opacity-50"
    >
      {loading ? (
        <LoaderCircle className="h-3 w-3 animate-spin" />
      ) : (
        <Download className="h-3 w-3" />
      )}
      {label}
    </button>
  );
}
