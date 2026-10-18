"use client";

import { useEffect, useState } from "react";
import type { SettingsErrors } from "@/components/room/room-page-types";
import { apiFetch } from "@/lib/client";
import { LAST_ROOM_STORAGE_KEY } from "@/lib/constants";
import { toast } from "@/lib/toast-store";
import { toastError } from "@/lib/feedback";
import { useT } from "@/lib/i18n/context";
import { sortRooms } from "@/lib/room-page";
import type { BootstrapPayload, RoomSnapshot, RoomTreeItem } from "@/types/chat";
import { validateGateCode, validateRoomName } from "@/lib/form-validation";

type Params = {
  roomCode: string;
  isOwner: boolean;
  snap: RoomSnapshot | null;
  setSnap: React.Dispatch<React.SetStateAction<RoomSnapshot | null>>;
  setBoot: React.Dispatch<React.SetStateAction<BootstrapPayload | null>>;
  rooms: { created: RoomTreeItem[]; joined: RoomTreeItem[] };
  refresh: () => Promise<void>;
  setAction: React.Dispatch<React.SetStateAction<string | null>>;
  router: { push: (href: string) => void };
};

export function useRoomSettings({
  roomCode,
  isOwner,
  snap,
  setSnap,
  setBoot,
  rooms,
  refresh,
  setAction,
  router,
}: Params) {
  const t = useT();
  const [gateCodeInput, setGateCodeInput] = useState("");
  const [roomNameInput, setRoomNameInput] = useState("");
  const [settingsErrors, setSettingsErrors] = useState<SettingsErrors>({});

  useEffect(() => {
    if (!snap || snap.me.role !== "OWNER") return;
    setGateCodeInput(snap.room.gateCode ?? "");
    setRoomNameInput(snap.room.name);
  }, [snap]);

  async function dissolve() {
    if (!window.confirm("确认解散当前房间？解散后成员将全部退出。")) return;
    setAction("dissolve");
    try {
      const beforeSortedRooms = sortRooms([...rooms.created, ...rooms.joined]);
      const currentIndex = beforeSortedRooms.findIndex(
        (item) => item.roomCode === roomCode,
      );

      await apiFetch<{ success: boolean }>(`/api/rooms/${roomCode}/dissolve`, {
        method: "POST",
        body: JSON.stringify({}),
      });

      const latestBoot = await apiFetch<BootstrapPayload>("/api/bootstrap");
      setBoot(latestBoot);

      const remainingRooms = sortRooms([
        ...latestBoot.tree.createdRooms,
        ...latestBoot.tree.joinedRooms,
      ]);

      if (remainingRooms.length === 0) {
        localStorage.removeItem(LAST_ROOM_STORAGE_KEY);
        router.push("/");
        return;
      }

      const nextIndex =
        currentIndex >= 0
          ? Math.min(currentIndex, remainingRooms.length - 1)
          : 0;
      const nextRoomCode =
        remainingRooms[nextIndex]?.roomCode ?? remainingRooms[0]?.roomCode;

      if (nextRoomCode) {
        localStorage.setItem(LAST_ROOM_STORAGE_KEY, nextRoomCode);
        router.push(`/room/${nextRoomCode}`);
      } else {
        localStorage.removeItem(LAST_ROOM_STORAGE_KEY);
        router.push("/");
      }
    } catch (err) {
      toastError(err, t("toast.dissolveFailed"), t);
    } finally {
      setAction(null);
    }
  }

  async function updateRoomName() {
    if (!isOwner) return;

    const normalized = roomNameInput.trim();
    const nameError = validateRoomName(normalized);
    if (nameError) {
      setSettingsErrors((prev) => ({ ...prev, roomName: t(nameError) }));
      return;
    }
    setSettingsErrors((prev) => ({ ...prev, roomName: undefined }));

    setAction("room-name");
    try {
      const result = await apiFetch<{ name: string }>(
        `/api/rooms/${roomCode}/name`,
        {
          method: "POST",
          body: JSON.stringify({
            name: normalized,
          }),
        },
      );

      setSnap((prev) =>
        prev
          ? {
              ...prev,
              room: {
                ...prev.room,
                name: result.name,
              },
            }
          : prev,
      );
      setRoomNameInput(result.name);

      toast.success(t("toast.roomNameUpdated"));
      await refresh();
    } catch (err) {
      toastError(err, t("toast.roomNameUpdateFailed"), t);
    } finally {
      setAction(null);
    }
  }

  async function updateGateCode() {
    if (!isOwner) return;

    const normalized = gateCodeInput.replace(/\D/g, "").slice(0, 6);
    const gateCodeError = validateGateCode(normalized);
    if (gateCodeError) {
      setSettingsErrors((prev) => ({ ...prev, gateCode: t(gateCodeError) }));
      return;
    }
    setSettingsErrors((prev) => ({ ...prev, gateCode: undefined }));

    setAction("gate-code");
    try {
      await apiFetch<{ gateCode: string | null; hasGateCode: boolean }>(
        `/api/rooms/${roomCode}/gate-code`,
        {
          method: "POST",
          body: JSON.stringify({
            gateCode: normalized || undefined,
          }),
        },
      );
      await refresh();
      toast.success(
        normalized ? t("toast.gateCodeUpdated") : t("toast.gateCodeCleared"),
      );
    } catch (err) {
      toastError(err, t("toast.gateCodeUpdateFailed"), t);
    } finally {
      setAction(null);
    }
  }

  async function updateJoinPolicy(nextAllowJoinRequest: boolean) {
    if (!isOwner) return;
    setAction("join-policy");
    try {
      const result = await apiFetch<{ allowJoinRequest: boolean }>(
        `/api/rooms/${roomCode}/join-policy`,
        {
          method: "POST",
          body: JSON.stringify({
            allowJoinRequest: nextAllowJoinRequest,
          }),
        },
      );

      setSnap((prev) =>
        prev
          ? {
              ...prev,
              room: {
                ...prev.room,
                allowJoinRequest: result.allowJoinRequest,
              },
            }
          : prev,
      );

      toast.success(
        result.allowJoinRequest
          ? t("toast.joinPolicyAllowed")
          : t("toast.joinPolicyDenied"),
      );
      await refresh();
    } catch (err) {
      toastError(err, t("toast.joinPolicyUpdateFailed"), t);
    } finally {
      setAction(null);
    }
  }

  async function updateNeverExpire(nextNeverExpire: boolean) {
    if (!isOwner) return;
    setAction("never-expire");
    try {
      const result = await apiFetch<{ neverExpire: boolean }>(
        `/api/rooms/${roomCode}/never-expire`,
        {
          method: "POST",
          body: JSON.stringify({
            neverExpire: nextNeverExpire,
          }),
        },
      );

      setSnap((prev) =>
        prev
          ? {
              ...prev,
              room: {
                ...prev.room,
                neverExpire: result.neverExpire,
              },
            }
          : prev,
      );

      toast.success(
        result.neverExpire
          ? t("toast.neverExpireOn")
          : t("toast.neverExpireOff"),
      );
      await refresh();
    } catch (err) {
      toastError(err, t("toast.neverExpireUpdateFailed"), t);
    } finally {
      setAction(null);
    }
  }

  return {
    gateCodeInput,
    setGateCodeInput,
    roomNameInput,
    setRoomNameInput,
    settingsErrors,
    setSettingsErrors,
    dissolve,
    updateRoomName,
    updateGateCode,
    updateJoinPolicy,
    updateNeverExpire,
  };
}
