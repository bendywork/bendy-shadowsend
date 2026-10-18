"use client";

import {
  Copy,
  LoaderCircle,
  Megaphone,
  PanelLeft,
  QrCode,
  Settings2,
  Trash2,
  Users,
} from "lucide-react";
import { AdCarousel } from "@/components/chat/ad-carousel";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { IconButton } from "@/components/ui/icon-button";
import { Tooltip } from "@/components/ui/tooltip";
import { LanguageToggle } from "@/components/ui/language-toggle";
import { useT } from "@/lib/i18n/context";
import type { RoomSnapshot } from "@/types/chat";

type Props = {
  snap: RoomSnapshot;
  isOwner: boolean;
  action: string | null;
  navVisible: boolean;
  membersVisible: boolean;
  settingsOpen: boolean;
  toggleNavCollapsed: () => void;
  toggleMembersCollapsed: () => void;
  setSettingsOpen: (open: boolean) => void;
  copyLink: () => Promise<void>;
  setShowQr: (open: boolean) => void;
  openNoticeEditor: () => void;
  openNoticeViewer: () => void;
  dissolve: () => Promise<void>;
  scrollToPanel: (target: "rooms" | "members") => void;
};

export function RoomHeader({
  snap,
  isOwner,
  action,
  navVisible,
  membersVisible,
  settingsOpen,
  toggleNavCollapsed,
  toggleMembersCollapsed,
  setSettingsOpen,
  copyLink,
  setShowQr,
  openNoticeEditor,
  openNoticeViewer,
  dissolve,
  scrollToPanel,
}: Props) {
  const t = useT();

  return (
    <header className="space-y-3 border-b border-line-subtle px-3 py-3 sm:px-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">{snap.room.name}</h1>
          <p className="font-mono text-xs text-ink-faint">
            /{snap.room.roomCode}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center text-xs text-ink-muted">
            <Users className="mr-1 inline h-3.5 w-3.5" />
            {t("header.members", { count: snap.members.length, max: 20 })}
          </span>
          <ThemeToggle />
          <LanguageToggle />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {navVisible ? (
          <button
            type="button"
            onClick={() => scrollToPanel("rooms")}
            className="inline-flex items-center rounded-lg border border-line px-2.5 py-1.5 text-xs text-ink-soft hover:bg-elevated xl:hidden"
          >
            {t("nav.rooms")}
          </button>
        ) : null}
        {membersVisible ? (
          <button
            type="button"
            onClick={() => scrollToPanel("members")}
            className="inline-flex items-center rounded-lg border border-line px-2.5 py-1.5 text-xs text-ink-soft hover:bg-elevated xl:hidden"
          >
            {t("members.list")}
          </button>
        ) : null}
        <Tooltip
          label={
            navVisible ? t("control.nav.hide") : t("control.nav.show")
          }
        >
          <IconButton
            aria-label={
              navVisible ? t("control.nav.hide") : t("control.nav.show")
            }
            active={navVisible}
            onClick={toggleNavCollapsed}
          >
            <PanelLeft className="h-4 w-4" />
          </IconButton>
        </Tooltip>
        <Tooltip label={t("header.invite")}>
          <IconButton aria-label={t("header.invite")} onClick={copyLink}>
            <Copy className="h-4 w-4" />
          </IconButton>
        </Tooltip>
        <Tooltip label={t("header.qr")}>
          <IconButton
            aria-label={t("header.qr")}
            onClick={() => setShowQr(true)}
          >
            <QrCode className="h-4 w-4" />
          </IconButton>
        </Tooltip>
        <Tooltip
          label={
            isOwner
              ? t("header.announcement.edit")
              : t("header.announcement.view")
          }
        >
          <IconButton
            aria-label={t("header.announcement")}
            onClick={isOwner ? openNoticeEditor : openNoticeViewer}
          >
            <Megaphone className="h-4 w-4" />
          </IconButton>
        </Tooltip>
        <Tooltip
          label={
            membersVisible
              ? t("control.members.hide")
              : t("control.members.show")
          }
        >
          <IconButton
            aria-label={
              membersVisible
                ? t("control.members.hide")
                : t("control.members.show")
            }
            active={membersVisible}
            onClick={toggleMembersCollapsed}
          >
            <Users className="h-4 w-4" />
          </IconButton>
        </Tooltip>
        {isOwner ? (
          <Tooltip label={t("header.settings")}>
            <IconButton
              aria-label={t("header.settings")}
              active={settingsOpen}
              onClick={() => setSettingsOpen(true)}
            >
              <Settings2 className="h-4 w-4" />
            </IconButton>
          </Tooltip>
        ) : null}
        {isOwner ? (
          <Tooltip
            label={
              action === "dissolve"
                ? t("header.dissolving")
                : t("header.dissolve")
            }
          >
            <IconButton
              aria-label={t("header.dissolve")}
              danger
              onClick={dissolve}
              disabled={action === "dissolve"}
            >
              {action === "dissolve" ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </IconButton>
          </Tooltip>
        ) : null}
      </div>
      <AdCarousel items={snap.adBoard.items} />
    </header>
  );
}
