"use client";

import { type FormEvent, useState } from "react";
import type {
  CreateResult,
  JoinResult,
  RoomEntryErrors,
  RoomEntryMode,
} from "@/components/room/room-page-types";
import { apiFetch } from "@/lib/client";
import { LAST_ROOM_STORAGE_KEY, MAX_USER_ROOMS } from "@/lib/constants";
import { toast } from "@/lib/toast-store";
import { toastError } from "@/lib/feedback";
import { useT } from "@/lib/i18n/context";
import {
  validateGateCode,
  validateRoomCode,
  validateRoomName,
} from "@/lib/form-validation";
import type { BootstrapPayload, RoomTreeItem } from "@/types/chat";

type Params = {
  roomCode: string;
  canAddMoreRooms: boolean;
  joinLink: string | null;
  setBoot: React.Dispatch<React.SetStateAction<BootstrapPayload | null>>;
  setAction: React.Dispatch<React.SetStateAction<string | null>>;
  setOpenRoomMenu: React.Dispatch<
    React.SetStateAction<{ room: RoomTreeItem; top: number; left: number } | null>
  >;
  router: { push: (href: string) => void };
};

export function useRoomMembership({
  roomCode,
  canAddMoreRooms,
  joinLink,
  setBoot,
  setAction,
  setOpenRoomMenu,
  router,
}: Params) {
  const t = useT();
  const [roomEntryMode, setRoomEntryMode] = useState<RoomEntryMode>(null);
  const [roomEntrySubmitting, setRoomEntrySubmitting] = useState(false);
  const [roomEntryErrors, setRoomEntryErrors] = useState<RoomEntryErrors>({});
  const [createName, setCreateName] = useState("");
  const [createGateCode, setCreateGateCode] = useState("");
  const [joinRoomCode, setJoinRoomCode] = useState("");
  const [joinGateCode, setJoinGateCode] = useState("");
  const [joinInviteToken, setJoinInviteToken] = useState("");

  function openRoomEntry(mode: "create" | "join") {
    if (!canAddMoreRooms) {
      toast.error(t("toast.roomLimit", { max: MAX_USER_ROOMS }));
      return;
    }
    setRoomEntryMode(mode);
  }

  async function quickCreateRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canAddMoreRooms) {
      toast.error(t("toast.roomLimit", { max: MAX_USER_ROOMS }));
      return;
    }

    const nameError = validateRoomName(createName);
    const gateCodeError = validateGateCode(createGateCode);
    if (nameError || gateCodeError) {
      setRoomEntryErrors({
        ...(nameError ? { name: t(nameError) } : {}),
        ...(gateCodeError ? { gateCode: t(gateCodeError) } : {}),
      });
      return;
    }
    setRoomEntryErrors({});

    setRoomEntrySubmitting(true);

    try {
      const payload = await apiFetch<CreateResult>("/api/rooms", {
        method: "POST",
        body: JSON.stringify({
          name: createName,
          gateCode: createGateCode || undefined,
        }),
      });

      setRoomEntryMode(null);
      localStorage.setItem(LAST_ROOM_STORAGE_KEY, payload.room.roomCode);
      router.push(`/room/${payload.room.roomCode}`);
    } catch (createError) {
      toastError(createError, t("toast.createRoomFailed"), t);
    } finally {
      setRoomEntrySubmitting(false);
    }
  }

  async function quickJoinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canAddMoreRooms) {
      toast.error(t("toast.roomLimit", { max: MAX_USER_ROOMS }));
      return;
    }

    const roomCodeError = validateRoomCode(joinRoomCode);
    const gateCodeError = validateGateCode(joinGateCode);
    if (roomCodeError || gateCodeError) {
      setRoomEntryErrors({
        ...(roomCodeError ? { roomCode: t(roomCodeError) } : {}),
        ...(gateCodeError ? { gateCode: t(gateCodeError) } : {}),
      });
      return;
    }
    setRoomEntryErrors({});

    setRoomEntrySubmitting(true);

    try {
      const targetRoomCode = joinRoomCode.trim();
      const payload = await apiFetch<JoinResult>(
        `/api/rooms/${targetRoomCode}/join`,
        {
          method: "POST",
          body: JSON.stringify({
            gateCode: joinGateCode || undefined,
            inviteToken: joinInviteToken || undefined,
          }),
        },
      );

      if (payload.waitingApproval) {
        toast.info(t("toast.joinRequestSent"));
        setRoomEntryMode(null);
        return;
      }

      if (payload.joined && payload.roomCode) {
        setRoomEntryMode(null);
        localStorage.setItem(LAST_ROOM_STORAGE_KEY, payload.roomCode);
        router.push(`/room/${payload.roomCode}`);
      }
    } catch (joinError) {
      toastError(joinError, t("toast.joinRoomFailed"), t);
    } finally {
      setRoomEntrySubmitting(false);
    }
  }

  async function leaveRoom(target: RoomTreeItem) {
    if (target.role !== "MEMBER") return;
    if (!window.confirm(`确认退出房间「${target.name}」吗？`)) return;

    setOpenRoomMenu(null);
    setAction(`leave-${target.roomCode}`);

    try {
      await apiFetch<{ success: boolean }>(
        `/api/rooms/${target.roomCode}/leave`,
        {
          method: "POST",
          body: JSON.stringify({}),
        },
      );

      const latestBoot = await apiFetch<BootstrapPayload>("/api/bootstrap");
      setBoot(latestBoot);

      if (target.roomCode === roomCode) {
        const nextRoomCode =
          latestBoot.tree.createdRooms[0]?.roomCode ??
          latestBoot.tree.joinedRooms[0]?.roomCode;
        if (nextRoomCode) {
          localStorage.setItem(LAST_ROOM_STORAGE_KEY, nextRoomCode);
          router.push(`/room/${nextRoomCode}`);
        } else {
          localStorage.removeItem(LAST_ROOM_STORAGE_KEY);
          router.push("/");
        }
        return;
      }

      toast.success(t("toast.leftRoom", { name: target.name }));
    } catch (leaveError) {
      toastError(leaveError, t("toast.leaveRoomFailed"), t);
    } finally {
      setAction(null);
    }
  }

  async function copyLink() {
    if (!joinLink) return;
    try {
      await navigator.clipboard.writeText(joinLink);
      toast.success(t("toast.linkCopied"));
    } catch {
      toast.error(t("toast.copyFailed"));
    }
  }

  return {
    roomEntryMode,
    setRoomEntryMode,
    roomEntrySubmitting,
    roomEntryErrors,
    setRoomEntryErrors,
    createName,
    setCreateName,
    createGateCode,
    setCreateGateCode,
    joinRoomCode,
    setJoinRoomCode,
    joinGateCode,
    setJoinGateCode,
    joinInviteToken,
    setJoinInviteToken,
    openRoomEntry,
    quickCreateRoom,
    quickJoinRoom,
    leaveRoom,
    copyLink,
  };
}
