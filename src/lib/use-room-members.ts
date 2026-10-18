"use client";

import { apiFetch } from "@/lib/client";
import { toast } from "@/lib/toast-store";
import { toastError } from "@/lib/feedback";
import { useT } from "@/lib/i18n/context";
import type { PendingRequestItem, RoomMemberItem } from "@/types/chat";

type Params = {
  roomCode: string;
  refresh: () => Promise<void>;
  setAction: React.Dispatch<React.SetStateAction<string | null>>;
};

export function useRoomMembers({ roomCode, refresh, setAction }: Params) {
  const t = useT();

  async function kick(m: RoomMemberItem) {
    if (!window.confirm(`确认将 ${m.user.nickname} 移出房间吗？`)) return;
    setAction(`kick-${m.id}`);
    try {
      await apiFetch<{ success: boolean }>(
        `/api/rooms/${roomCode}/members/${m.id}/kick`,
        { method: "POST", body: JSON.stringify({}) },
      );
      await refresh();
      toast.success(t("toast.memberRemoved", { name: m.user.nickname }));
    } catch (err) {
      toastError(err, t("toast.memberRemoveFailed"), t);
    } finally {
      setAction(null);
    }
  }

  async function transferOwner(m: RoomMemberItem) {
    if (
      !window.confirm(
        `确认将房主身份转让给 ${m.user.nickname} 吗？转让后你将变为普通成员。`,
      )
    ) {
      return;
    }
    setAction(`transfer-${m.id}`);
    try {
      await apiFetch<{ success: boolean }>(
        `/api/rooms/${roomCode}/members/${m.id}/transfer`,
        {
          method: "POST",
          body: JSON.stringify({}),
        },
      );
      await refresh();
      toast.success(t("toast.ownerTransferred", { name: m.user.nickname }));
    } catch (err) {
      toastError(err, t("toast.transferFailed"), t);
    } finally {
      setAction(null);
    }
  }

  async function review(
    r: PendingRequestItem,
    act: "approve" | "reject",
  ) {
    setAction(`${act}-${r.id}`);
    try {
      await apiFetch<{ success: boolean }>(
        `/api/rooms/${roomCode}/join-requests/${r.id}`,
        { method: "POST", body: JSON.stringify({ action: act }) },
      );
      await refresh();
      toast.success(
        t(
          act === "approve"
            ? "toast.approvalApproved"
            : "toast.approvalRejected",
          {
            name: r.user.nickname,
          },
        ),
      );
    } catch (err) {
      toastError(err, t("toast.approvalFailed"), t);
    } finally {
      setAction(null);
    }
  }

  return { kick, transferOwner, review };
}
