"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/client";
import { LAST_ROOM_STORAGE_KEY } from "@/lib/constants";
import { resolveErrorMessage, toastError } from "@/lib/feedback";
import { useT } from "@/lib/i18n/context";
import {
  FAST_POLL_INTERVAL_MS,
  SNAPSHOT_SYNC_INTERVAL_MS,
  mergeIncomingMessages,
  withStableAttachmentPreviewUrls,
} from "@/lib/room-page";
import type {
  BootstrapPayload,
  RoomSnapshot,
} from "@/types/chat";
import type { MessageListPayload } from "@/components/room/room-page-types";

export function useRoomData(
  roomCode: string,
  onShowAnnouncement: () => void,
) {
  const t = useT();
  const [boot, setBoot] = useState<BootstrapPayload | null>(null);
  const [snap, setSnap] = useState<RoomSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const latestMessageAtRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    const [b, s] = await Promise.all([
      apiFetch<BootstrapPayload>("/api/bootstrap"),
      apiFetch<RoomSnapshot>(`/api/rooms/${roomCode}`),
    ]);
    latestMessageAtRef.current = s.messages.at(-1)?.createdAt ?? null;
    setBoot(b);
    setSnap((prev) => withStableAttachmentPreviewUrls(prev, s));
    setLoadError(null);
    if (s.announcement.showToMe) onShowAnnouncement();
  }, [roomCode, onShowAnnouncement]);

  const pollLatestMessages = useCallback(async () => {
    const after = latestMessageAtRef.current;
    const search = after ? `?after=${encodeURIComponent(after)}` : "";
    const payload = await apiFetch<MessageListPayload>(
      `/api/rooms/${roomCode}/messages${search}`,
    );

    if (payload.messages.length === 0) {
      return;
    }

    latestMessageAtRef.current =
      payload.messages.at(-1)?.createdAt ?? after ?? null;
    setSnap((prev) =>
      prev ? mergeIncomingMessages(prev, payload.messages) : prev,
    );
    setLoadError(null);
  }, [roomCode]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await refresh();
        if (alive) localStorage.setItem(LAST_ROOM_STORAGE_KEY, roomCode);
      } catch (error) {
        if (alive) {
          setLoadError(
            resolveErrorMessage(error, t("toast.loadFailed"), t),
          );
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [roomCode, refresh, t]);

  const pollingEnabled = Boolean(snap && !snap.waitingApproval);

  useEffect(() => {
    if (!pollingEnabled) return;
    const heartbeat = window.setInterval(() => {
      void apiFetch<{ success: boolean }>("/api/presence", {
        method: "POST",
        body: JSON.stringify({ roomCode }),
      }).catch(() => undefined);
    }, 25000);
    const messagePoll = window.setInterval(() => {
      void pollLatestMessages().catch((error) =>
        toastError(error, t("toast.messageRefreshFailed"), t),
      );
    }, FAST_POLL_INTERVAL_MS);
    const snapshotSync = window.setInterval(() => {
      void refresh().catch((error) =>
        toastError(error, t("toast.roomSyncFailed"), t),
      );
    }, SNAPSHOT_SYNC_INTERVAL_MS);
    return () => {
      window.clearInterval(heartbeat);
      window.clearInterval(messagePoll);
      window.clearInterval(snapshotSync);
    };
  }, [roomCode, pollingEnabled, pollLatestMessages, refresh, t]);

  const retry = useCallback(() => {
    setLoading(true);
    void refresh()
      .catch((error) =>
        setLoadError(resolveErrorMessage(error, t("toast.loadFailed"), t)),
      )
      .finally(() => setLoading(false));
  }, [refresh, t]);

  return {
    boot,
    setBoot,
    snap,
    setSnap,
    loading,
    loadError,
    refresh,
    pollLatestMessages,
    latestMessageAtRef,
    pollingEnabled,
    retry,
  };
}
