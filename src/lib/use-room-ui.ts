"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ImageViewerState,
  MemberPanelTab,
  RoomMenuState,
} from "@/components/room/room-page-types";
import { computeRoomMenuPosition } from "@/lib/room-page";
import { usePersistentBoolean } from "@/lib/use-persistent-boolean";
import type { RoomTreeItem } from "@/types/chat";

export function useRoomUi(isOwner: boolean) {
  const [membersCollapsed, , toggleMembersCollapsed] = usePersistentBoolean(
    "tb:members-collapsed",
    false,
  );
  const [navCollapsed, , toggleNavCollapsed] = usePersistentBoolean(
    "tb:nav-collapsed",
    false,
  );
  const [createdCollapsed, , toggleCreatedCollapsed] = usePersistentBoolean(
    "tb:nav-group-created",
    false,
  );
  const [joinedCollapsed, , toggleJoinedCollapsed] = usePersistentBoolean(
    "tb:nav-group-joined",
    false,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [openRoomMenu, setOpenRoomMenu] = useState<RoomMenuState | null>(null);
  const [openMemberMenuId, setOpenMemberMenuId] = useState<string | null>(null);
  const [memberPanelTab, setMemberPanelTab] =
    useState<MemberPanelTab>("members");
  const [imageViewer, setImageViewer] = useState<ImageViewerState | null>(null);
  const floatingRoomMenuRef = useRef<HTMLDivElement | null>(null);
  const memberMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!openRoomMenu) return;
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (floatingRoomMenuRef.current?.contains(target)) return;

      const triggerElement =
        target instanceof Element
          ? target.closest(
              `[data-room-menu-trigger="${openRoomMenu.room.id}"]`,
            )
          : null;
      if (triggerElement) return;

      setOpenRoomMenu(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenRoomMenu(null);
      }
    };
    const closeRoomMenu = () => {
      setOpenRoomMenu(null);
    };
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", closeRoomMenu);
    window.addEventListener("scroll", closeRoomMenu, true);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", closeRoomMenu);
      window.removeEventListener("scroll", closeRoomMenu, true);
    };
  }, [openRoomMenu]);

  useEffect(() => {
    if (!openMemberMenuId) return;
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (memberMenuRef.current?.contains(target)) return;
      setOpenMemberMenuId(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenMemberMenuId(null);
      }
    };
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [openMemberMenuId]);

  useEffect(() => {
    if (isOwner) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- preserve owner-reset behavior
    setOpenMemberMenuId(null);
  }, [isOwner]);

  useEffect(() => {
    if (!isOwner && memberPanelTab !== "members") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- preserve owner-reset behavior
      setMemberPanelTab("members");
    }
  }, [isOwner, memberPanelTab]);

  useEffect(() => {
    if (!imageViewer) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setImageViewer(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [imageViewer]);

  const handleToggleRoomMenu = useCallback(
    (targetRoom: RoomTreeItem, triggerButton: HTMLButtonElement) => {
      setOpenRoomMenu((current) => {
        if (current?.room.id === targetRoom.id) return null;
        const rect = triggerButton.getBoundingClientRect();
        const position = computeRoomMenuPosition(rect, {
          width: window.innerWidth,
          height: window.innerHeight,
        });
        return { room: targetRoom, left: position.left, top: position.top };
      });
    },
    [],
  );

  const closeRoomMenu = useCallback(() => setOpenRoomMenu(null), []);
  const toggleMemberMenu = useCallback((memberId: string) => {
    setOpenMemberMenuId((prev) => (prev === memberId ? null : memberId));
  }, []);

  const openImageViewer = useCallback(
    (url: string | null | undefined, fileName: string) => {
      if (!url) return;
      setImageViewer({ url, fileName });
    },
    [],
  );

  return {
    membersCollapsed,
    toggleMembersCollapsed,
    navCollapsed,
    toggleNavCollapsed,
    createdCollapsed,
    toggleCreatedCollapsed,
    joinedCollapsed,
    toggleJoinedCollapsed,
    settingsOpen,
    setSettingsOpen,
    openRoomMenu,
    setOpenRoomMenu,
    openMemberMenuId,
    setOpenMemberMenuId,
    toggleMemberMenu,
    memberPanelTab,
    setMemberPanelTab,
    imageViewer,
    setImageViewer,
    floatingRoomMenuRef,
    memberMenuRef,
    handleToggleRoomMenu,
    closeRoomMenu,
    openImageViewer,
  };
}
