"use client";

import type { ReactNode } from "react";
import clsx from "clsx";
import {
  Check,
  Clock3,
  Copy,
  Crown,
  Infinity as InfinityIcon,
  LoaderCircle,
  Megaphone,
  MoreHorizontal,
  PanelLeft,
  QrCode,
  Settings2,
  Shield,
  Trash2,
  User,
  Users,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { IconButton } from "@/components/ui/icon-button";
import { LanguageToggle } from "@/components/ui/language-toggle";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/menu";
import { Tooltip } from "@/components/ui/tooltip";
import { useT } from "@/lib/i18n/context";

export type RoomHeaderProps = {
  roomName: string;
  roomCode: string;
  memberCount: number;
  memberLimit: number;
  role: "OWNER" | "MEMBER";
  hasGateCode: boolean;
  neverExpire: boolean;
  pendingRequestCount: number;
  announcementUnread: boolean;
  navVisible: boolean;
  membersVisible: boolean;
  settingsOpen: boolean;
  dissolving: boolean;
  copiedRoomCode: boolean;
  hint: string | null;
  adSlot?: ReactNode;
  onCopyRoomCode: () => void;
  onCopyLink: () => void;
  onOpenQr: () => void;
  onOpenAnnouncement: () => void;
  onOpenSettings: () => void;
  onDissolve: () => void;
  onToggleNav: () => void;
  onToggleMembers: () => void;
  onScrollToRooms: () => void;
  onScrollToMembers: () => void;
  onOpenApprovals: () => void;
};

// 聊天页顶栏：左侧承载房间身份与状态，右侧只保留高频操作，
// 低频操作（视图 / 偏好 / 管理）收进“更多”菜单。
export function RoomHeader({
  roomName,
  roomCode,
  memberCount,
  memberLimit,
  role,
  hasGateCode,
  neverExpire,
  pendingRequestCount,
  announcementUnread,
  navVisible,
  membersVisible,
  settingsOpen,
  dissolving,
  copiedRoomCode,
  hint,
  adSlot,
  onCopyRoomCode,
  onCopyLink,
  onOpenQr,
  onOpenAnnouncement,
  onOpenSettings,
  onDissolve,
  onToggleNav,
  onToggleMembers,
  onScrollToRooms,
  onScrollToMembers,
  onOpenApprovals,
}: RoomHeaderProps) {
  const t = useT();
  const isOwner = role === "OWNER";
  const announcementLabel = announcementUnread
    ? t("header.announcement.unread")
    : t("header.announcement");

  return (
    <header className="border-b border-line-subtle bg-panel/55 px-3 py-3 sm:px-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 basis-64">
          <div className="flex min-w-0 items-center gap-2">
            <h1
              className="truncate text-lg font-semibold tracking-tight text-ink sm:text-xl"
              title={roomName}
            >
              {roomName}
            </h1>
            <span
              className={clsx(
                "chip shrink-0 gap-1",
                isOwner && "border-action-border text-ink-soft",
              )}
            >
              {isOwner ? (
                <Crown className="h-3 w-3" aria-hidden />
              ) : (
                <User className="h-3 w-3" aria-hidden />
              )}
              {isOwner ? t("header.role.owner") : t("header.role.member")}
            </span>
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-ink-muted">
            <button
              type="button"
              onClick={onCopyRoomCode}
              aria-label={t("header.copyCode")}
              className="group inline-flex items-center gap-1 rounded-sm font-mono text-ink-faint transition-colors duration-fast hover:text-ink-soft"
            >
              <span aria-hidden>#</span>
              <span className="select-all">{roomCode}</span>
              {copiedRoomCode ? (
                <Check className="h-3 w-3 text-success" aria-hidden />
              ) : (
                <Copy
                  className="h-3 w-3 opacity-0 transition-opacity duration-fast group-hover:opacity-100 group-focus-visible:opacity-100"
                  aria-hidden
                />
              )}
            </button>

            <span className="h-3 w-px bg-line-subtle" aria-hidden />

            <span className="inline-flex items-center gap-1">
              <Users className="h-3.5 w-3.5" aria-hidden />
              {t("header.members", { count: memberCount, max: memberLimit })}
            </span>

            {hasGateCode ? (
              <span className="inline-flex items-center gap-1">
                <Shield className="h-3.5 w-3.5" aria-hidden />
                {t("header.status.gateCode")}
              </span>
            ) : null}

            {neverExpire ? (
              <span className="inline-flex items-center gap-1">
                <InfinityIcon className="h-3.5 w-3.5" aria-hidden />
                {t("header.status.neverExpire")}
              </span>
            ) : null}

            {isOwner && pendingRequestCount > 0 ? (
              <button
                type="button"
                onClick={onOpenApprovals}
                className="inline-flex items-center gap-1 rounded-full border border-warning-border bg-warning-soft px-2 py-0.5 text-[10px] font-medium text-warning transition-colors duration-fast hover:brightness-110"
              >
                <Clock3 className="h-3 w-3" aria-hidden />
                {t("header.status.pending", { count: pendingRequestCount })}
              </button>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex items-center gap-1.5 xl:hidden">
            <button
              type="button"
              onClick={onScrollToRooms}
              aria-label={t("nav.rooms")}
              className="btn-ghost btn-sm px-2"
            >
              <PanelLeft className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">{t("nav.rooms")}</span>
            </button>
            <button
              type="button"
              onClick={onScrollToMembers}
              aria-label={t("members.list")}
              className="btn-ghost btn-sm px-2"
            >
              <Users className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">{t("members.list")}</span>
            </button>
          </div>

          <span
            className="mx-0.5 hidden h-5 w-px bg-line-subtle sm:block xl:hidden"
            aria-hidden
          />

          <button
            type="button"
            onClick={onCopyLink}
            className="btn-primary btn-sm h-[34px] px-2.5"
          >
            <Copy className="h-3.5 w-3.5" aria-hidden />
            <span>{t("header.invite")}</span>
          </button>

          <Tooltip label={t("header.qr")}>
            <IconButton aria-label={t("header.qr")} onClick={onOpenQr}>
              <QrCode className="h-4 w-4" />
            </IconButton>
          </Tooltip>

          <Tooltip label={announcementLabel}>
            <IconButton
              aria-label={announcementLabel}
              onClick={onOpenAnnouncement}
              className="relative"
            >
              <Megaphone className="h-4 w-4" />
              {announcementUnread ? (
                <span
                  className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-success"
                  aria-hidden
                />
              ) : null}
            </IconButton>
          </Tooltip>

          <Menu
            label={t("header.more")}
            trigger={<MoreHorizontal className="h-4 w-4" />}
            className="w-56"
          >
            <MenuLabel>{t("header.menu.view")}</MenuLabel>
            <MenuItem icon={<PanelLeft className="h-3.5 w-3.5" />} onSelect={onToggleNav}>
              {navVisible ? t("control.nav.hide") : t("control.nav.show")}
            </MenuItem>
            <MenuItem icon={<Users className="h-3.5 w-3.5" />} onSelect={onToggleMembers}>
              {membersVisible ? t("control.members.hide") : t("control.members.show")}
            </MenuItem>

            <MenuSeparator />
            <MenuLabel>{t("header.menu.preferences")}</MenuLabel>
            <div
              role="group"
              aria-label={t("header.menu.preferences")}
              className="space-y-1.5 px-2 py-1.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-ink-muted">{t("control.appearance")}</span>
                <ThemeToggle />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-ink-muted">{t("control.language")}</span>
                <LanguageToggle />
              </div>
            </div>

            {isOwner ? (
              <>
                <MenuSeparator />
                <MenuLabel>{t("header.menu.manage")}</MenuLabel>
                <MenuItem
                  icon={<Settings2 className="h-3.5 w-3.5" />}
                  onSelect={onOpenSettings}
                  disabled={settingsOpen}
                >
                  {t("header.settings")}
                </MenuItem>
                <MenuItem
                  icon={
                    dissolving ? (
                      <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )
                  }
                  danger
                  onSelect={onDissolve}
                  disabled={dissolving}
                >
                  {dissolving ? t("header.dissolving") : t("header.dissolve")}
                </MenuItem>
              </>
            ) : null}
          </Menu>
        </div>
      </div>

      {adSlot ? <div className="mt-3">{adSlot}</div> : null}
      {hint ? <div className="notice mt-3">{hint}</div> : null}
    </header>
  );
}
