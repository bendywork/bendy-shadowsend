"use client";

import type { RefObject } from "react";
import { createPortal } from "react-dom";
import type { RoomMenuState } from "@/components/room/room-page-types";
import type { RoomTreeItem } from "@/types/chat";

type Props = {
  openRoomMenu: RoomMenuState | null;
  floatingRoomMenuRef: RefObject<HTMLDivElement | null>;
  action: string | null;
  leaveRoom: (room: RoomTreeItem) => Promise<void>;
};

export function RoomMenu({
  openRoomMenu,
  floatingRoomMenuRef,
  action,
  leaveRoom,
}: Props) {
  if (!openRoomMenu) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={floatingRoomMenuRef}
      role="menu"
      className="fixed z-[90] w-24 rounded-md border border-line bg-panel p-1 shadow-lg"
      style={{
        top: `${openRoomMenu.top}px`,
        left: `${openRoomMenu.left}px`,
      }}
    >
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          void leaveRoom(openRoomMenu.room);
        }}
        disabled={action === `leave-${openRoomMenu.room.roomCode}`}
        className="inline-flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-xs text-ink-soft hover:bg-elevated disabled:opacity-60"
      >
        退出房间
      </button>
    </div>,
    document.body,
  );
}
