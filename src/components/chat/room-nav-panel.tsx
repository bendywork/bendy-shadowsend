"use client";

import clsx from "clsx";
import Image from "next/image";
import Link from "next/link";
import {
  ChevronRight,
  MoreHorizontal,
  PanelLeftClose,
  Plus,
  Shield,
} from "lucide-react";
import { Avatar } from "@/components/chat/avatar";
import { IconButton } from "@/components/ui/icon-button";
import { Tooltip } from "@/components/ui/tooltip";
import { useT } from "@/lib/i18n/context";
import type { RoomTreeItem } from "@/types/chat";

type RoomGroup = {
  created: RoomTreeItem[];
  joined: RoomTreeItem[];
};

export type RoomNavPanelProps = {
  rooms: RoomGroup;
  activeCode: string;
  roomCount: number;
  maxRooms: number;
  canAddMoreRooms: boolean;
  roomEntrySubmitting: boolean;
  createdCollapsed: boolean;
  joinedCollapsed: boolean;
  appVersion: string;
  openSource: string;
  stats: { roomOnline: number; totalOnline: number };
  me: { avatarInitial: string; avatarColor: string; nickname: string };
  onToggleCreated: () => void;
  onToggleJoined: () => void;
  onOpenRoomEntry: (mode: "create" | "join") => void;
  onToggleRoomMenu: (room: RoomTreeItem, triggerButton: HTMLButtonElement) => void;
  onCollapse?: () => void;
  onNavigate?: () => void;
  showHeader?: boolean;
};

function RoomLinks({
  rooms,
  activeCode,
  onToggleMenu,
  onNavigate,
  emptyLabel,
}: {
  rooms: RoomTreeItem[];
  activeCode: string;
  onToggleMenu: (room: RoomTreeItem, triggerButton: HTMLButtonElement) => void;
  onNavigate?: () => void;
  emptyLabel?: string;
}) {
  const t = useT();

  return (
    <div className="space-y-1">
      {rooms.length === 0 ? (
        <p className="rounded-lg border border-line-subtle bg-panel/60 px-3 py-2 text-xs text-ink-faint">
          {emptyLabel}
        </p>
      ) : (
        rooms.map((room) => (
          <div
            key={room.id}
            className={clsx(
              "rounded-lg border px-3 py-2 text-sm",
              activeCode === room.roomCode
                ? "border-action-border bg-action-soft text-ink"
                : "border-line-subtle bg-panel/70 text-ink-soft hover:border-line",
            )}
          >
            <div className="flex items-start gap-2">
              <Link
                href={`/room/${room.roomCode}`}
                className="min-w-0 flex-1"
                onClick={onNavigate}
              >
                <div className="flex items-center gap-1.5">
                  <span className="truncate">{room.name}</span>
                  {activeCode === room.roomCode ? (
                    <span
                      title={t("nav.current")}
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-success shadow-[0_0_8px_var(--ds-success-glow)]"
                    />
                  ) : null}
                  {room.hasGateCode ? (
                    <Shield className="h-3.5 w-3.5 shrink-0 text-ink-soft" />
                  ) : null}
                </div>
                <p className="mt-1 truncate font-mono text-[11px] text-ink-faint">
                  {room.roomCode}
                </p>
              </Link>
              {room.role === "MEMBER" ? (
                <button
                  type="button"
                  aria-label={t("nav.roomActions")}
                  aria-haspopup="menu"
                  data-room-menu-trigger={room.id}
                  onClick={(event) => onToggleMenu(room, event.currentTarget)}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-line text-ink-soft hover:bg-elevated xl:h-8 xl:w-8"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export function RoomNavPanel({
  rooms,
  activeCode,
  roomCount,
  maxRooms,
  canAddMoreRooms,
  roomEntrySubmitting,
  createdCollapsed,
  joinedCollapsed,
  appVersion,
  openSource,
  stats,
  me,
  onToggleCreated,
  onToggleJoined,
  onOpenRoomEntry,
  onToggleRoomMenu,
  onCollapse,
  onNavigate,
  showHeader = true,
}: RoomNavPanelProps) {
  const t = useT();

  return (
    <div className="flex h-full min-h-0 flex-col p-4">
      {showHeader ? (
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
          {onCollapse ? (
            <Tooltip label={t("nav.collapse")}>
              <IconButton aria-label={t("nav.collapse")} onClick={onCollapse}>
                <PanelLeftClose className="h-4 w-4" />
              </IconButton>
            </Tooltip>
          ) : null}
        </div>
      ) : null}

      <p className="mb-3 flex flex-wrap items-center gap-x-1.5 text-[11px] text-ink-faint">
        <span>{t("nav.count", { count: roomCount, max: maxRooms })}</span>
        {!canAddMoreRooms ? (
          <span className="text-ink-faint">· {t("nav.count.full")}</span>
        ) : null}
      </p>

      <div className="flex-1 space-y-4 overflow-y-auto pb-3">
        <div>
          <div className="mb-2 flex items-center gap-1">
            <button
              type="button"
              onClick={onToggleCreated}
              aria-expanded={!createdCollapsed}
              className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 py-2 text-xs uppercase tracking-[0.16em] text-ink-faint hover:text-ink-soft xl:py-1"
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
              onClick={() => onOpenRoomEntry("create")}
              disabled={!canAddMoreRooms || roomEntrySubmitting}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-line text-ink-soft hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-45 xl:h-8 xl:w-8"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          {!createdCollapsed ? (
            <RoomLinks
              rooms={rooms.created}
              activeCode={activeCode}
              onToggleMenu={onToggleRoomMenu}
              onNavigate={onNavigate}
              emptyLabel={t("nav.empty")}
            />
          ) : null}
        </div>

        <div>
          <div className="mb-2 flex items-center gap-1">
            <button
              type="button"
              onClick={onToggleJoined}
              aria-expanded={!joinedCollapsed}
              className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 py-2 text-xs uppercase tracking-[0.16em] text-ink-faint hover:text-ink-soft xl:py-1"
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
              onClick={() => onOpenRoomEntry("join")}
              disabled={!canAddMoreRooms || roomEntrySubmitting}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-line text-ink-soft hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-45 xl:h-8 xl:w-8"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          {!joinedCollapsed ? (
            <RoomLinks
              rooms={rooms.joined}
              activeCode={activeCode}
              onToggleMenu={onToggleRoomMenu}
              onNavigate={onNavigate}
              emptyLabel={t("nav.empty")}
            />
          ) : null}
        </div>
      </div>

      <div className="mt-auto space-y-2 rounded-xl border border-line-subtle bg-panel/70 p-3 text-xs text-ink-muted">
        <p>
          {t("footer.version")}{" "}
          <span className="font-semibold text-ink-soft">{appVersion}</span>
        </p>
        <p>
          {t("footer.license")}{" "}
          <span className="font-semibold text-ink-soft">{openSource}</span>
        </p>
        <p>
          {t("footer.roomOnline")}{" "}
          <span className="font-semibold text-ink-soft">{stats.roomOnline}</span>
        </p>
        <p>
          {t("footer.totalOnline")}{" "}
          <span className="font-semibold text-ink-soft">{stats.totalOnline}</span>
        </p>
        <div className="pt-2">
          <p className="text-ink-faint">{t("footer.currentUser")}</p>
          <div className="mt-1 flex items-center gap-2">
            <Avatar initial={me.avatarInitial} color={me.avatarColor} />
            <span className="text-sm text-ink-soft">{me.nickname}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
