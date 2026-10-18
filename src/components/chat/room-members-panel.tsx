"use client";

import type { RefObject } from "react";
import { Check, Crown, MoreHorizontal, PanelRightClose, UserMinus, X } from "lucide-react";
import { Avatar } from "@/components/chat/avatar";
import { IconButton } from "@/components/ui/icon-button";
import { Tooltip } from "@/components/ui/tooltip";
import { formatTimestamp } from "@/lib/format";
import { useT } from "@/lib/i18n/context";
import type { PendingRequestItem, RoomMemberItem } from "@/types/chat";

export type MemberPanelTab = "members" | "approvals";

export type RoomMembersPanelProps = {
  isOwner: boolean;
  members: RoomMemberItem[];
  pendingRequests: PendingRequestItem[];
  tab: MemberPanelTab;
  onTabChange: (tab: MemberPanelTab) => void;
  openMemberMenuId: string | null;
  onToggleMemberMenu: (memberId: string | null) => void;
  memberMenuRef: RefObject<HTMLDivElement | null>;
  action: string | null;
  onTransferOwner: (member: RoomMemberItem) => void;
  onKick: (member: RoomMemberItem) => void;
  onReview: (request: PendingRequestItem, decision: "approve" | "reject") => void;
  onCollapse?: () => void;
  showHeader?: boolean;
  error?: string | null;
};

export function RoomMembersPanel({
  isOwner,
  members,
  pendingRequests,
  tab,
  onTabChange,
  openMemberMenuId,
  onToggleMemberMenu,
  memberMenuRef,
  action,
  onTransferOwner,
  onKick,
  onReview,
  onCollapse,
  showHeader = true,
  error,
}: RoomMembersPanelProps) {
  const t = useT();

  const tabs = isOwner ? (
    <div className="segmented mt-2 grid grid-cols-2 gap-1 p-1">
      <button
        type="button"
        onClick={() => {
          onToggleMemberMenu(null);
          onTabChange("members");
        }}
        className="segmented-item min-h-11 px-2 py-1.5 text-xs font-medium xl:min-h-0"
        data-active={tab === "members"}
      >
        {t("members.tab.members")}
      </button>
      <button
        type="button"
        onClick={() => {
          onToggleMemberMenu(null);
          onTabChange("approvals");
        }}
        className="segmented-item min-h-11 px-2 py-1.5 text-xs font-medium xl:min-h-0"
        data-active={tab === "approvals"}
      >
        {t("members.tab.approvals")}
      </button>
    </div>
  ) : null;

  return (
    <div className="flex h-full min-h-0 flex-col p-4">
      {showHeader ? (
        <div className="mb-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs uppercase tracking-[0.16em] text-ink-faint">
              {isOwner ? t("members.manage") : t("members.list")}
            </p>
            {onCollapse ? (
              <Tooltip label={t("members.collapse")}>
                <IconButton
                  aria-label={t("members.collapse")}
                  className="h-7 w-7"
                  onClick={onCollapse}
                >
                  <PanelRightClose className="h-4 w-4" />
                </IconButton>
              </Tooltip>
            ) : null}
          </div>
          {tabs}
        </div>
      ) : (
        <div className="mb-3">{tabs}</div>
      )}

      {tab === "members" || !isOwner ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <h2 className="mb-2 text-lg font-semibold text-ink">
            {t("members.count", { count: members.length })}
          </h2>
          <div className="flex-1 space-y-2 overflow-y-auto pr-1">
            {members.map((member) => (
              <div
                key={member.id}
                className="rounded-lg border border-line-subtle bg-panel/70 px-3 py-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <Avatar
                      initial={member.user.avatarInitial}
                      color={member.user.avatarColor}
                      className="h-7 w-7"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm text-ink-soft">
                        {member.user.nickname}
                      </p>
                      <p className="text-xs text-ink-faint">
                        {member.role === "OWNER"
                          ? t("members.role.owner")
                          : t("members.role.member")}{" "}
                        ·{" "}
                        {member.joinedAt
                          ? formatTimestamp(member.joinedAt)
                          : "--"}
                      </p>
                    </div>
                  </div>
                  {isOwner && member.role !== "OWNER" ? (
                    <div
                      ref={openMemberMenuId === member.id ? memberMenuRef : null}
                      className="relative shrink-0"
                    >
                      <button
                        type="button"
                        aria-label={t("members.actions")}
                        aria-haspopup="menu"
                        aria-expanded={openMemberMenuId === member.id}
                        onClick={() =>
                          onToggleMemberMenu(
                            openMemberMenuId === member.id ? null : member.id,
                          )
                        }
                        className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-action-border text-ink-soft hover:bg-elevated xl:h-9 xl:w-9"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                      {openMemberMenuId === member.id ? (
                        <div
                          role="menu"
                          className="absolute right-0 top-10 z-20 w-36 rounded-md border border-line bg-panel p-1.5 shadow-lg"
                        >
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              onToggleMemberMenu(null);
                              onTransferOwner(member);
                            }}
                            disabled={action === `transfer-${member.id}`}
                            className="inline-flex min-h-11 w-full items-center gap-1 rounded-md px-2 py-2.5 text-left text-xs text-ink-soft hover:bg-elevated disabled:opacity-60 xl:min-h-0 xl:py-1.5"
                          >
                            <Crown className="h-3 w-3" /> {t("members.transfer")}
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              onToggleMemberMenu(null);
                              onKick(member);
                            }}
                            disabled={action === `kick-${member.id}`}
                            className="inline-flex min-h-11 w-full items-center gap-1 rounded-md px-2 py-2.5 text-left text-xs text-ink-soft hover:bg-elevated disabled:opacity-60 xl:min-h-0 xl:py-1.5"
                          >
                            <UserMinus className="h-3 w-3" /> {t("members.kick")}
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

      {isOwner && tab === "approvals" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <h2 className="mb-2 text-lg font-semibold text-ink">
            {t("approvals.title")}
          </h2>
          <div className="flex-1 space-y-2 overflow-y-auto pr-1">
            {pendingRequests.length === 0 ? (
              <p className="rounded-lg border border-line-subtle bg-panel/60 px-3 py-2 text-xs text-ink-faint">
                {t("approvals.empty")}
              </p>
            ) : (
              pendingRequests.map((request) => (
                <div
                  key={request.id}
                  className="rounded-lg border border-line-subtle bg-panel/70 p-2.5"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <Avatar
                      initial={request.user.avatarInitial}
                      color={request.user.avatarColor}
                      className="h-6 w-6"
                    />
                    <div>
                      <p className="text-sm text-ink-soft">
                        {request.user.nickname}
                      </p>
                      <p className="text-[11px] text-ink-faint">
                        {formatTimestamp(request.createdAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => onReview(request, "approve")}
                      disabled={action === `approve-${request.id}`}
                      className="inline-flex min-h-11 items-center gap-1 rounded-md border border-action-border px-2 py-2 text-xs text-ink-soft disabled:opacity-60 xl:min-h-0 xl:py-1"
                    >
                      <Check className="h-3 w-3" /> {t("approvals.approve")}
                    </button>
                    <button
                      type="button"
                      onClick={() => onReview(request, "reject")}
                      disabled={action === `reject-${request.id}`}
                      className="inline-flex min-h-11 items-center gap-1 rounded-md border border-action-border px-2 py-2 text-xs text-ink-soft disabled:opacity-60 xl:min-h-0 xl:py-1"
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

      {error ? <p className="mt-3 text-xs text-ink-soft">{error}</p> : null}
    </div>
  );
}
