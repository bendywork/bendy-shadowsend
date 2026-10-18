"use client";

import type { ReactNode, RefObject } from "react";
import clsx from "clsx";
import {
  Check,
  Crown,
  MoreHorizontal,
  PanelRightClose,
  UserMinus,
  X,
} from "lucide-react";
import { Avatar } from "@/components/chat/avatar";
import { IconButton } from "@/components/ui/icon-button";
import { Tooltip } from "@/components/ui/tooltip";
import { useT } from "@/lib/i18n/context";
import { formatRoomTime } from "@/lib/room-page";
import type { MemberPanelTab } from "@/components/room/room-page-types";
import type {
  PendingRequestItem,
  RoomMemberItem,
  RoomSnapshot,
} from "@/types/chat";

type Props = {
  snap: RoomSnapshot;
  isOwner: boolean;
  action: string | null;
  membersVisible: boolean;
  memberPanelTab: MemberPanelTab;
  openMemberMenuId: string | null;
  membersPanelRef: RefObject<HTMLElement | null>;
  memberMenuRef: RefObject<HTMLDivElement | null>;
  settingsPopover?: ReactNode;
  toggleMembersCollapsed: () => void;
  setMemberPanelTab: (tab: MemberPanelTab) => void;
  setOpenMemberMenuId: (
    value: string | null | ((prev: string | null) => string | null),
  ) => void;
  kick: (member: RoomMemberItem) => Promise<void>;
  transferOwner: (member: RoomMemberItem) => Promise<void>;
  review: (
    request: PendingRequestItem,
    act: "approve" | "reject",
  ) => Promise<void>;
};

export function MembersPanel({
  snap,
  isOwner,
  action,
  membersVisible,
  memberPanelTab,
  openMemberMenuId,
  membersPanelRef,
  memberMenuRef,
  settingsPopover,
  toggleMembersCollapsed,
  setMemberPanelTab,
  setOpenMemberMenuId,
  kick,
  transferOwner,
  review,
}: Props) {
  const t = useT();

  return (
    <aside
      ref={membersPanelRef}
      className={clsx(
        "order-3 min-h-0 max-h-[56vh] flex-col rounded-none border border-line-subtle bg-canvas p-4 xl:order-3 xl:max-h-none",
        membersVisible ? "flex" : "hidden",
      )}
    >
      <div className="mb-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs uppercase tracking-[0.16em] text-ink-faint">
            {isOwner ? t("members.manage") : t("members.list")}
          </p>
          <Tooltip label={t("members.collapse")}>
            <IconButton
              aria-label={t("members.collapse")}
              className="h-7 w-7"
              onClick={toggleMembersCollapsed}
            >
              <PanelRightClose className="h-4 w-4" />
            </IconButton>
          </Tooltip>
        </div>
        {isOwner ? (
          <div className="segmented mt-2 grid grid-cols-2 gap-1 p-1">
            <button
              type="button"
              onClick={() => {
                setOpenMemberMenuId(null);
                setMemberPanelTab("members");
              }}
              className="segmented-item px-2 py-1.5 text-xs font-medium"
              data-active={memberPanelTab === "members"}
            >
              {t("members.tab.members")}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpenMemberMenuId(null);
                setMemberPanelTab("approvals");
              }}
              className="segmented-item px-2 py-1.5 text-xs font-medium"
              data-active={memberPanelTab === "approvals"}
            >
              {t("members.tab.approvals")}
            </button>
          </div>
        ) : null}
      </div>

      {memberPanelTab === "members" || !isOwner ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <h2 className="mb-2 text-lg font-semibold text-ink">
            {t("members.count", { count: snap.members.length })}
          </h2>
          <div className="flex-1 space-y-2 overflow-y-auto pr-1">
            {snap.members.map((m) => (
              <div
                key={m.id}
                className="rounded-lg border border-line-subtle bg-panel/70 px-3 py-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <Avatar
                      initial={m.user.avatarInitial}
                      color={m.user.avatarColor}
                      className="h-7 w-7"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm text-ink-soft">
                        {m.user.nickname}
                      </p>
                      <p className="text-xs text-ink-faint">
                        {m.role === "OWNER"
                          ? t("members.role.owner")
                          : t("members.role.member")}{" "}
                        · {m.joinedAt ? formatRoomTime(m.joinedAt) : "--"}
                      </p>
                    </div>
                  </div>
                  {isOwner && m.role !== "OWNER" ? (
                    <div
                      ref={openMemberMenuId === m.id ? memberMenuRef : null}
                      className="relative shrink-0"
                    >
                      <button
                        type="button"
                        aria-label="成员操作"
                        aria-haspopup="menu"
                        aria-expanded={openMemberMenuId === m.id}
                        onClick={() =>
                          setOpenMemberMenuId((prev) =>
                            prev === m.id ? null : m.id,
                          )
                        }
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-action-border text-ink-soft hover:bg-elevated"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                      {openMemberMenuId === m.id ? (
                        <div
                          role="menu"
                          className="absolute right-0 top-9 z-20 w-32 rounded-md border border-line bg-panel p-1.5 shadow-lg"
                        >
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setOpenMemberMenuId(null);
                              void transferOwner(m);
                            }}
                            disabled={action === `transfer-${m.id}`}
                            className="inline-flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-xs text-ink-soft hover:bg-elevated disabled:opacity-60"
                          >
                            <Crown className="h-3 w-3" /> 房主转让
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setOpenMemberMenuId(null);
                              void kick(m);
                            }}
                            disabled={action === `kick-${m.id}`}
                            className="inline-flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-xs text-ink-soft hover:bg-elevated disabled:opacity-60"
                          >
                            <UserMinus className="h-3 w-3" /> 移除房间
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {isOwner && memberPanelTab === "approvals" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <h2 className="mb-2 text-lg font-semibold text-ink">
            {t("approvals.title")}
          </h2>
          <div className="flex-1 space-y-2 overflow-y-auto pr-1">
            {snap.pendingRequests.length === 0 ? (
              <p className="rounded-lg border border-line-subtle bg-panel/60 px-3 py-2 text-xs text-ink-faint">
                {t("approvals.empty")}
              </p>
            ) : (
              snap.pendingRequests.map((r) => (
                <div
                  key={r.id}
                  className="rounded-lg border border-line-subtle bg-panel/70 p-2.5"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <Avatar
                      initial={r.user.avatarInitial}
                      color={r.user.avatarColor}
                      className="h-6 w-6"
                    />
                    <div>
                      <p className="text-sm text-ink-soft">{r.user.nickname}</p>
                      <p className="text-[11px] text-ink-faint">
                        {formatRoomTime(r.createdAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => review(r, "approve")}
                      disabled={action === `approve-${r.id}`}
                      className="inline-flex items-center gap-1 rounded-md border border-action-border px-2 py-1 text-xs text-ink-soft disabled:opacity-60"
                    >
                      <Check className="h-3 w-3" /> {t("approvals.approve")}
                    </button>
                    <button
                      type="button"
                      onClick={() => review(r, "reject")}
                      disabled={action === `reject-${r.id}`}
                      className="inline-flex items-center gap-1 rounded-md border border-action-border px-2 py-1 text-xs text-ink-soft disabled:opacity-60"
                    >
                      <X className="h-3 w-3" /> {t("approvals.reject")}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}

      {settingsPopover}
    </aside>
  );
}
