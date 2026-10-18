"use client";

import type { RefObject } from "react";
import clsx from "clsx";
import Image from "next/image";
import { ChevronRight, PanelLeftClose, Plus } from "lucide-react";
import { Avatar } from "@/components/chat/avatar";
import { RoomLinks } from "@/components/room/room-links";
import { IconButton } from "@/components/ui/icon-button";
import { Tooltip } from "@/components/ui/tooltip";
import { MAX_USER_ROOMS } from "@/lib/constants";
import { useT } from "@/lib/i18n/context";
import type { RoomSnapshot, RoomTreeItem } from "@/types/chat";

type Props = {
  snap: RoomSnapshot;
  rooms: { created: RoomTreeItem[]; joined: RoomTreeItem[] };
  roomCode: string;
  roomCount: number;
  canAddMoreRooms: boolean;
  navVisible: boolean;
  roomEntrySubmitting: boolean;
  createdCollapsed: boolean;
  joinedCollapsed: boolean;
  roomsPanelRef: RefObject<HTMLElement | null>;
  toggleNavCollapsed: () => void;
  toggleCreatedCollapsed: () => void;
  toggleJoinedCollapsed: () => void;
  openRoomEntry: (mode: "create" | "join") => void;
  onToggleMenu: (room: RoomTreeItem, triggerButton: HTMLButtonElement) => void;
};

export function RoomSidebar({
  snap,
  rooms,
  roomCode,
  roomCount,
  canAddMoreRooms,
  navVisible,
  roomEntrySubmitting,
  createdCollapsed,
  joinedCollapsed,
  roomsPanelRef,
  toggleNavCollapsed,
  toggleCreatedCollapsed,
  toggleJoinedCollapsed,
  openRoomEntry,
  onToggleMenu,
}: Props) {
  const t = useT();

  return (
    <aside
      ref={roomsPanelRef}
      className={clsx(
        "order-2 min-h-0 max-h-[52vh] flex-col rounded-none border border-line-subtle bg-canvas p-4 xl:order-1 xl:max-h-none",
        navVisible ? "flex" : "hidden",
      )}
    >
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="relative h-9 w-9 overflow-hidden rounded-lg border border-line-subtle bg-panel/70 p-1">
            <Image
              src="/1.png"
              alt="Temp Bendy"
              fill
              sizes="36px"
              className="theme-dark-only object-contain p-1"
            />
            <Image
              src="/1-light.png"
              alt="Temp Bendy（日间）"
              fill
              sizes="36px"
              className="theme-light-only object-contain p-1"
            />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-ink-faint">
              {t("nav.title")}
            </p>
            <h2 className="truncate text-lg font-semibold text-ink">
              {t("nav.subtitle")}
            </h2>
          </div>
        </div>
        <Tooltip label={t("nav.collapse")}>
          <IconButton
            aria-label={t("nav.collapse")}
            onClick={toggleNavCollapsed}
          >
            <PanelLeftClose className="h-4 w-4" />
          </IconButton>
        </Tooltip>
      </div>
      <p className="mb-3 flex flex-wrap items-center gap-x-1.5 text-[11px] text-ink-faint">
        <span>
          {t("nav.count", { count: roomCount, max: MAX_USER_ROOMS })}
        </span>
        {!canAddMoreRooms ? (
          <span className="text-ink-faint">· {t("nav.count.full")}</span>
        ) : null}
      </p>
      <div className="flex-1 space-y-4 overflow-y-auto pb-3">
        <div>
          <div className="mb-2 flex items-center gap-1">
            <button
              type="button"
              onClick={toggleCreatedCollapsed}
              aria-expanded={!createdCollapsed}
              className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 py-1 text-xs uppercase tracking-[0.16em] text-ink-faint hover:text-ink-soft"
            >
              <ChevronRight
                className={clsx(
                  "h-3.5 w-3.5 shrink-0 transition-transform",
                  !createdCollapsed && "rotate-90",
                )}
              />
              <span className="truncate">{t("nav.group.created")}</span>
              <span className="ml-auto rounded-full bg-elevated px-1.5 py-0.5 text-[10px] font-medium text-ink-muted">
                {rooms.created.length}
              </span>
            </button>
            <button
              type="button"
              aria-label={t("nav.create")}
              title={t("nav.create")}
              onClick={() => openRoomEntry("create")}
              disabled={!canAddMoreRooms || roomEntrySubmitting}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-line text-ink-soft hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          {!createdCollapsed ? (
            <RoomLinks
              rooms={rooms.created}
              activeCode={roomCode}
              onToggleMenu={onToggleMenu}
              emptyLabel={t("nav.empty")}
            />
          ) : null}
        </div>
        <div>
          <div className="mb-2 flex items-center gap-1">
            <button
              type="button"
              onClick={toggleJoinedCollapsed}
              aria-expanded={!joinedCollapsed}
              className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 py-1 text-xs uppercase tracking-[0.16em] text-ink-faint hover:text-ink-soft"
            >
              <ChevronRight
                className={clsx(
                  "h-3.5 w-3.5 shrink-0 transition-transform",
                  !joinedCollapsed && "rotate-90",
                )}
              />
              <span className="truncate">{t("nav.group.joined")}</span>
              <span className="ml-auto rounded-full bg-elevated px-1.5 py-0.5 text-[10px] font-medium text-ink-muted">
                {rooms.joined.length}
              </span>
            </button>
            <button
              type="button"
              aria-label={t("nav.join")}
              title={t("nav.join")}
              onClick={() => openRoomEntry("join")}
              disabled={!canAddMoreRooms || roomEntrySubmitting}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-line text-ink-soft hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          {!joinedCollapsed ? (
            <RoomLinks
              rooms={rooms.joined}
              activeCode={roomCode}
              onToggleMenu={onToggleMenu}
              emptyLabel={t("nav.empty")}
            />
          ) : null}
        </div>
      </div>
      <div className="mt-auto space-y-2 rounded-xl border border-line-subtle bg-panel/70 p-3 text-xs text-ink-muted">
        <p>
          {t("footer.version")}{" "}
          <span className="font-semibold text-ink-soft">
            {snap.app.version}
          </span>
        </p>
        <p>
          {t("footer.license")}{" "}
          <span className="font-semibold text-ink-soft">
            {snap.app.openSource}
          </span>
        </p>
        <p>
          {t("footer.roomOnline")}{" "}
          <span className="font-semibold text-ink-soft">
            {snap.stats.roomOnline}
          </span>
        </p>
        <p>
          {t("footer.totalOnline")}{" "}
          <span className="font-semibold text-ink-soft">
            {snap.stats.totalOnline}
          </span>
        </p>
        <div className="pt-2">
          <p className="text-ink-faint">{t("footer.currentUser")}</p>
          <div className="mt-1 flex items-center gap-2">
            <Avatar
              initial={snap.me.avatarInitial}
              color={snap.me.avatarColor}
            />
            <span className="text-sm text-ink-soft">{snap.me.nickname}</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
