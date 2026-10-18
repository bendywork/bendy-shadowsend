"use client";

import { forwardRef, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import clsx from "clsx";
import {
  Check,
  ChevronRight,
  Copy,
  LogOut,
  MoreHorizontal,
  PanelLeftClose,
  Plus,
  Shield,
} from "lucide-react";
import { Avatar } from "@/components/chat/avatar";
import { IconButton } from "@/components/ui/icon-button";
import { Menu, MenuItem } from "@/components/ui/menu";
import { Tooltip } from "@/components/ui/tooltip";
import { useT } from "@/lib/i18n/context";
import type { RoomTreeItem } from "@/types/chat";

type SidebarApp = { version: string; openSource: string };
type SidebarStats = { roomOnline: number; totalOnline: number };
type SidebarUser = { avatarInitial: string; avatarColor: string; nickname: string };

export type RoomSidebarProps = {
  rooms: { created: RoomTreeItem[]; joined: RoomTreeItem[] };
  activeCode: string;
  roomCount: number;
  maxRooms: number;
  canAddMoreRooms: boolean;
  submitting: boolean;
  createdCollapsed: boolean;
  joinedCollapsed: boolean;
  onToggleCreated: () => void;
  onToggleJoined: () => void;
  onCreate: () => void;
  onJoin: () => void;
  onLeaveRoom: (room: RoomTreeItem) => void;
  leavingRoomCode: string | null;
  onCopyError: (message: string) => void;
  onToggleNav: () => void;
  app: SidebarApp;
  stats: SidebarStats;
  me: SidebarUser;
  className?: string;
};

function SidebarHeader({ onToggleNav }: { onToggleNav: () => void }) {
  const t = useT();

  return (
    <div className="mb-4 flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-xl bg-panel/80 p-1">
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
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.18em] text-ink-faint">
            {t("nav.title")}
          </p>
          <h2 className="truncate text-base font-semibold tracking-tight text-ink">
            {t("nav.subtitle")}
          </h2>
        </div>
      </div>
      <Tooltip label={t("nav.collapse")}>
        <IconButton
          aria-label={t("nav.collapse")}
          onClick={onToggleNav}
          className="h-8 w-8"
        >
          <PanelLeftClose className="h-4 w-4" />
        </IconButton>
      </Tooltip>
    </div>
  );
}

function RoomEmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="room-empty">
      <span className="room-empty__mark" aria-hidden>
        +
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-ink-muted">{title}</p>
        <p className="mt-0.5 text-[11px] leading-4 text-ink-faint">{hint}</p>
      </div>
    </div>
  );
}

function RoomGroup({
  title,
  count,
  collapsed,
  onToggle,
  createLabel,
  onCreate,
  createDisabled,
  emptyTitle,
  emptyHint,
  children,
}: {
  title: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  createLabel: string;
  onCreate: () => void;
  createDisabled: boolean;
  emptyTitle: string;
  emptyHint: string;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-1 flex items-center gap-1">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          className="room-group__toggle"
        >
          <ChevronRight
            className={clsx(
              "room-group__chevron h-3.5 w-3.5 shrink-0",
              !collapsed && "rotate-90",
            )}
            aria-hidden
          />
          <span className="truncate text-[11px] font-medium uppercase tracking-[0.14em]">
            {title}
          </span>
          <span className="room-group__count">{count}</span>
        </button>
        <Tooltip label={createLabel}>
          <IconButton
            aria-label={createLabel}
            onClick={onCreate}
            disabled={createDisabled}
            className="h-7 w-7"
          >
            <Plus className="h-3.5 w-3.5" />
          </IconButton>
        </Tooltip>
      </div>
      {!collapsed ? (
        <div className="space-y-0.5">
          {count === 0 ? (
            <RoomEmptyState title={emptyTitle} hint={emptyHint} />
          ) : (
            children
          )}
        </div>
      ) : null}
    </section>
  );
}

function RoomItem({
  room,
  active,
  leaving,
  onLeaveRoom,
  onCopyError,
}: {
  room: RoomTreeItem;
  active: boolean;
  leaving: boolean;
  onLeaveRoom: (room: RoomTreeItem) => void;
  onCopyError: (message: string) => void;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    },
    [],
  );

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(room.roomCode);
      setCopied(true);
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setCopied(false), 1400);
    } catch {
      onCopyError(t("nav.copyFailed"));
    }
  }

  return (
    <div
      className={clsx("room-item", active && "room-item--active")}
      data-testid={`room-item-${room.roomCode}`}
    >
      <Link
        href={`/room/${room.roomCode}`}
        aria-current={active ? "page" : undefined}
        className="room-item__link"
      >
        <span className="room-item__avatar" aria-hidden>
          {room.name.slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-sm">{room.name}</span>
            {active ? (
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-success"
                role="img"
                aria-label={t("nav.currentRoom")}
              />
            ) : null}
            {room.hasGateCode ? (
              <Shield
                className="h-3 w-3 shrink-0 text-ink-faint"
                role="img"
                aria-label={t("nav.gateCode")}
              />
            ) : null}
          </span>
          <span className="mt-0.5 block truncate font-mono text-[11px] text-ink-faint">
            #{room.roomCode}
          </span>
        </span>
      </Link>

      <div className="room-item__actions">
        <Tooltip label={copied ? t("nav.copied") : t("nav.copyCode")}>
          <IconButton
            aria-label={copied ? t("nav.copied") : t("nav.copyCode")}
            onClick={() => void copyCode()}
            className="h-7 w-7"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-success" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </IconButton>
        </Tooltip>
        {room.role === "MEMBER" ? (
          <Menu
            label={t("nav.roomActions")}
            trigger={<MoreHorizontal className="h-3.5 w-3.5" />}
            triggerClassName="h-7 w-7"
            className="w-44"
          >
            <MenuItem
              icon={<LogOut className="h-3.5 w-3.5" />}
              danger
              disabled={leaving}
              onSelect={() => onLeaveRoom(room)}
            >
              {leaving ? t("nav.leaving") : t("nav.leaveRoom")}
            </MenuItem>
          </Menu>
        ) : null}
      </div>
    </div>
  );
}

function SidebarFooter({
  app,
  stats,
  me,
}: {
  app: SidebarApp;
  stats: SidebarStats;
  me: SidebarUser;
}) {
  const t = useT();

  return (
    <div className="room-sidebar__footer mt-auto">
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
        <div className="min-w-0">
          <dt className="text-ink-faint">{t("footer.version")}</dt>
          <dd className="truncate font-medium text-ink-soft">{app.version}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-ink-faint">{t("footer.license")}</dt>
          <dd className="truncate font-medium text-ink-soft">{app.openSource}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-ink-faint">{t("footer.roomOnline")}</dt>
          <dd className="truncate font-medium text-ink-soft">{stats.roomOnline}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-ink-faint">{t("footer.totalOnline")}</dt>
          <dd className="truncate font-medium text-ink-soft">{stats.totalOnline}</dd>
        </div>
      </dl>
      <div className="mt-3 flex items-center gap-2">
        <Avatar initial={me.avatarInitial} color={me.avatarColor} />
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.14em] text-ink-faint">
            {t("footer.currentUser")}
          </p>
          <p className="truncate text-xs font-medium text-ink-soft">
            {me.nickname}
          </p>
        </div>
      </div>
    </div>
  );
}

// 左侧房间栏：分组折叠、活跃态、悬停快捷操作与空态。
// 列表层级只用背景与留白表达，不再使用描边。
export const RoomSidebar = forwardRef<HTMLElement, RoomSidebarProps>(
  function RoomSidebar(
    {
      rooms,
      activeCode,
      roomCount,
      maxRooms,
      canAddMoreRooms,
      submitting,
      createdCollapsed,
      joinedCollapsed,
      onToggleCreated,
      onToggleJoined,
      onCreate,
      onJoin,
      onLeaveRoom,
      leavingRoomCode,
      onCopyError,
      onToggleNav,
      app,
      stats,
      me,
      className,
    },
    ref,
  ) {
    const t = useT();
    const createDisabled = !canAddMoreRooms || submitting;

    return (
      <aside ref={ref} className={clsx("room-sidebar flex-col p-4", className)}>
        <SidebarHeader onToggleNav={onToggleNav} />
        <p className="mb-3 flex flex-wrap items-center gap-x-1.5 text-[11px] text-ink-faint">
          <span>{t("nav.count", { count: roomCount, max: maxRooms })}</span>
          {!canAddMoreRooms ? (
            <span className="text-warning">· {t("nav.count.full")}</span>
          ) : null}
        </p>

        <div className="room-sidebar__scroll flex-1 space-y-4 overflow-y-auto pb-10">
          <RoomGroup
            title={t("nav.group.created")}
            count={rooms.created.length}
            collapsed={createdCollapsed}
            onToggle={onToggleCreated}
            createLabel={t("nav.create")}
            onCreate={onCreate}
            createDisabled={createDisabled}
            emptyTitle={t("nav.empty.created")}
            emptyHint={t("nav.empty.createdHint")}
          >
            {rooms.created.map((room) => (
              <RoomItem
                key={room.id}
                room={room}
                active={room.roomCode === activeCode}
                leaving={leavingRoomCode === room.roomCode}
                onLeaveRoom={onLeaveRoom}
                onCopyError={onCopyError}
              />
            ))}
          </RoomGroup>

          <RoomGroup
            title={t("nav.group.joined")}
            count={rooms.joined.length}
            collapsed={joinedCollapsed}
            onToggle={onToggleJoined}
            createLabel={t("nav.join")}
            onCreate={onJoin}
            createDisabled={createDisabled}
            emptyTitle={t("nav.empty.joined")}
            emptyHint={t("nav.empty.joinedHint")}
          >
            {rooms.joined.map((room) => (
              <RoomItem
                key={room.id}
                room={room}
                active={room.roomCode === activeCode}
                leaving={leavingRoomCode === room.roomCode}
                onLeaveRoom={onLeaveRoom}
                onCopyError={onCopyError}
              />
            ))}
          </RoomGroup>
        </div>

        <SidebarFooter app={app} stats={stats} me={me} />
      </aside>
    );
  },
);
