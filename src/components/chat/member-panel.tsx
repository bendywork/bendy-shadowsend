"use client";

import clsx from "clsx";
import {
  Check,
  Crown,
  Inbox,
  LoaderCircle,
  MoreHorizontal,
  PanelRightClose,
  Settings2,
  UserMinus,
  Users,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Avatar } from "@/components/chat/avatar";
import { IconButton } from "@/components/ui/icon-button";
import { Tooltip } from "@/components/ui/tooltip";
import { useLanguage, useT } from "@/lib/i18n/context";
import type { Lang, MessageKey } from "@/lib/i18n/messages";
import { describeLastActive, isMemberOnline, type LastActiveDescriptor } from "@/lib/member-status";
import type { PendingRequestItem, RoomMemberItem } from "@/types/chat";

export type MemberPanelTab = "members" | "approvals";

type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;

type MemberPanelProps = {
  members: RoomMemberItem[];
  pendingRequests: PendingRequestItem[];
  isOwner: boolean;
  action: string | null;
  onCollapse: () => void;
  onOpenSettings: () => void;
  onKick: (member: RoomMemberItem) => void;
  onTransfer: (member: RoomMemberItem) => void;
  onReview: (request: PendingRequestItem, action: "approve" | "reject") => void;
  /** 固定“当前时间”便于测试；运行时由内部时钟推进。 */
  now?: number;
};

type MemberActionProps = {
  action: string | null;
  onKick: (member: RoomMemberItem) => void;
  onTransfer: (member: RoomMemberItem) => void;
};

function formatDateTime(value: string, lang: Lang): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString(lang === "zh" ? "zh-CN" : "en-US", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function lastActiveText(descriptor: LastActiveDescriptor, t: Translate): string {
  switch (descriptor.kind) {
    case "never":
      return t("members.active.never");
    case "justNow":
      return t("members.active.justNow");
    case "minutes":
      return t("members.active.minutesAgo", { count: descriptor.count });
    case "hours":
      return t("members.active.hoursAgo", { count: descriptor.count });
    case "days":
      return t("members.active.daysAgo", { count: descriptor.count });
  }
}

function RoleChip({ role }: { role: RoomMemberItem["role"] }) {
  const t = useT();
  const isOwnerRole = role === "OWNER";

  return (
    <span
      className={clsx(
        "chip shrink-0",
        isOwnerRole ? "border-action-border text-ink" : "text-ink-muted",
      )}
    >
      {isOwnerRole ? (
        <Crown className="h-2.5 w-2.5" aria-hidden />
      ) : (
        <Users className="h-2.5 w-2.5" aria-hidden />
      )}
      {t(isOwnerRole ? "members.role.owner" : "members.role.member")}
    </span>
  );
}

function useMenuDismiss(
  open: boolean,
  rootRef: RefObject<HTMLDivElement | null>,
  triggerRef: RefObject<HTMLButtonElement | null>,
  setOpen: (open: boolean) => void,
) {
  useEffect(() => {
    if (!open) return;

    const onMouseDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };

    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, rootRef, triggerRef, setOpen]);
}

function MemberMenuItems({
  member,
  action,
  onKick,
  onTransfer,
  onDone,
}: MemberActionProps & { member: RoomMemberItem; onDone: () => void }) {
  const t = useT();
  const transferring = action === `transfer-${member.id}`;
  const kicking = action === `kick-${member.id}`;
  const busy = transferring || kicking;

  const run = (callback: () => void) => {
    onDone();
    callback();
  };

  return (
    <>
      <p className="truncate px-2 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-ink-faint">
        {member.user.nickname}
      </p>
      <button
        type="button"
        role="menuitem"
        disabled={busy}
        className="menu-item"
        onClick={() => run(() => onTransfer(member))}
      >
        {transferring ? (
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : (
          <Crown className="h-3.5 w-3.5" aria-hidden />
        )}
        {t("members.transfer")}
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={busy}
        className="menu-item menu-item--danger"
        onClick={() => run(() => onKick(member))}
      >
        {kicking ? (
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : (
          <UserMinus className="h-3.5 w-3.5" aria-hidden />
        )}
        {t("members.kick")}
      </button>
    </>
  );
}

function MemberActionMenu({ member, action, onKick, onTransfer }: MemberActionProps & {
  member: RoomMemberItem;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  useMenuDismiss(open, rootRef, triggerRef, setOpen);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <IconButton
        ref={triggerRef}
        aria-label={t("members.actions")}
        aria-haspopup="menu"
        aria-expanded={open}
        className="h-8 w-8"
        onClick={() => setOpen((value) => !value)}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden />
      </IconButton>

      {open ? (
        <div
          role="menu"
          aria-label={t("members.actions")}
          className="menu-panel absolute right-0 top-9 z-20 w-44"
        >
          <MemberMenuItems
            member={member}
            action={action}
            onKick={onKick}
            onTransfer={onTransfer}
            onDone={close}
          />
        </div>
      ) : null}
    </div>
  );
}

function MemberAvatar({ member, online }: { member: RoomMemberItem; online: boolean }) {
  return (
    <span className="relative inline-flex shrink-0">
      <Avatar
        initial={member.user.avatarInitial}
        color={member.user.avatarColor}
        className="h-9 w-9"
      />
      <span
        className={clsx(
          "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-canvas",
          online ? "bg-success" : "bg-ink-faint",
        )}
        aria-hidden
      />
    </span>
  );
}

function MemberNameLine({ member }: { member: RoomMemberItem }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <p className="truncate text-sm font-medium text-ink">{member.user.nickname}</p>
      <RoleChip role={member.role} />
    </div>
  );
}

function MemberPresence({ member, now }: { member: RoomMemberItem; now: number }) {
  const t = useT();
  const online = isMemberOnline(member.lastSeenAt, now);
  const active = describeLastActive(member.lastSeenAt, now);

  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
      <span
        className={clsx(
          "inline-flex items-center gap-1",
          online ? "text-success" : "text-ink-faint",
        )}
        data-online={online ? "true" : "false"}
      >
        <span
          className={clsx("h-1.5 w-1.5 rounded-full", online ? "bg-success" : "bg-ink-faint")}
          aria-hidden
        />
        {t(online ? "members.online" : "members.offline")}
      </span>
      <span className="text-ink-faint">{lastActiveText(active, t)}</span>
    </div>
  );
}

function MemberCard({
  member,
  isOwner,
  action,
  now,
  onKick,
  onTransfer,
}: {
  member: RoomMemberItem;
  isOwner: boolean;
  now: number;
  onKick: (member: RoomMemberItem) => void;
  onTransfer: (member: RoomMemberItem) => void;
} & Pick<MemberActionProps, "action">) {
  const t = useT();
  const { lang } = useLanguage();
  const online = isMemberOnline(member.lastSeenAt, now);
  const joinedAt = member.joinedAt ? formatDateTime(member.joinedAt, lang) : null;

  return (
    <article
      className="rounded-xl bg-panel/60 p-3 transition-ui hover:bg-elevated/50"
      title={joinedAt ? t("members.joinedAt", { time: joinedAt }) : undefined}
    >
      <div className="flex items-start gap-2.5">
        <MemberAvatar member={member} online={online} />
        <div className="min-w-0 flex-1">
          <MemberNameLine member={member} />
          <MemberPresence member={member} now={now} />
        </div>
        {isOwner && member.role !== "OWNER" ? (
          <MemberActionMenu
            member={member}
            action={action}
            onKick={onKick}
            onTransfer={onTransfer}
          />
        ) : null}
      </div>
    </article>
  );
}

function ApprovalHeader({ request }: { request: PendingRequestItem }) {
  const t = useT();
  const { lang } = useLanguage();

  return (
    <div className="flex items-start gap-2.5">
      <Avatar
        initial={request.user.avatarInitial}
        color={request.user.avatarColor}
        className="h-8 w-8 shrink-0"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{request.user.nickname}</p>
        <p className="mt-0.5 text-[11px] text-ink-faint">
          {t("approvals.requestedAt", { time: formatDateTime(request.createdAt, lang) })}
        </p>
        {request.reason ? (
          <p className="mt-1.5 line-clamp-2 rounded-lg bg-elevated/50 px-2 py-1 text-xs text-ink-muted">
            <span className="text-ink-faint">{t("approvals.reason")}: </span>
            {request.reason}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function ApprovalActions({
  request,
  action,
  onReview,
}: {
  request: PendingRequestItem;
  action: string | null;
  onReview: (request: PendingRequestItem, action: "approve" | "reject") => void;
}) {
  const t = useT();
  const approving = action === `approve-${request.id}`;
  const rejecting = action === `reject-${request.id}`;
  const busy = approving || rejecting;

  return (
    <div className="mt-2.5 flex gap-2">
      <button
        type="button"
        disabled={busy}
        aria-busy={approving}
        className="btn-primary btn-sm flex-1"
        onClick={() => onReview(request, "approve")}
      >
        {approving ? (
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : (
          <Check className="h-3.5 w-3.5" aria-hidden />
        )}
        {t("approvals.approve")}
      </button>
      <button
        type="button"
        disabled={busy}
        aria-busy={rejecting}
        className="btn-secondary btn-sm flex-1"
        onClick={() => onReview(request, "reject")}
      >
        {rejecting ? (
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : (
          <X className="h-3.5 w-3.5" aria-hidden />
        )}
        {t("approvals.reject")}
      </button>
    </div>
  );
}

function ApprovalCard({
  request,
  action,
  onReview,
}: {
  request: PendingRequestItem;
  action: string | null;
  onReview: (request: PendingRequestItem, action: "approve" | "reject") => void;
}) {
  return (
    <article className="rounded-xl bg-panel/60 p-3">
      <ApprovalHeader request={request} />
      <ApprovalActions request={request} action={action} onReview={onReview} />
    </article>
  );
}

function EmptyState({ icon, title, hint }: { icon: ReactNode; title: string; hint: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center rounded-xl bg-panel/40 px-4 py-8 text-center">
      <span className="mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-elevated text-ink-faint">
        {icon}
      </span>
      <p className="text-xs font-medium text-ink-muted">{title}</p>
      <p className="mt-1 text-[11px] text-ink-faint">{hint}</p>
    </div>
  );
}

function MemberList({
  members,
  isOwner,
  action,
  now,
  onKick,
  onTransfer,
}: {
  members: RoomMemberItem[];
  isOwner: boolean;
  action: string | null;
  now: number;
  onKick: (member: RoomMemberItem) => void;
  onTransfer: (member: RoomMemberItem) => void;
}) {
  const t = useT();

  if (members.length === 0) {
    return (
      <EmptyState
        icon={<Users className="h-4 w-4" aria-hidden />}
        title={t("members.empty")}
        hint={t("members.emptyHint")}
      />
    );
  }

  return (
    <div className="flex-1 space-y-2 overflow-y-auto pr-1">
      {members.map((member) => (
        <MemberCard
          key={member.id}
          member={member}
          isOwner={isOwner}
          action={action}
          now={now}
          onKick={onKick}
          onTransfer={onTransfer}
        />
      ))}
    </div>
  );
}

function ApprovalList({
  requests,
  action,
  onReview,
}: {
  requests: PendingRequestItem[];
  action: string | null;
  onReview: (request: PendingRequestItem, action: "approve" | "reject") => void;
}) {
  const t = useT();

  if (requests.length === 0) {
    return (
      <EmptyState
        icon={<Inbox className="h-4 w-4" aria-hidden />}
        title={t("approvals.empty")}
        hint={t("approvals.emptyHint")}
      />
    );
  }

  return (
    <div className="flex-1 space-y-2 overflow-y-auto pr-1">
      {requests.map((request) => (
        <ApprovalCard key={request.id} request={request} action={action} onReview={onReview} />
      ))}
    </div>
  );
}

function PanelTab({
  id,
  panelId,
  active,
  label,
  count,
  onClick,
}: {
  id: string;
  panelId: string;
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      id={id}
      aria-controls={panelId}
      aria-selected={active}
      data-active={active}
      className="segmented-item inline-flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-medium"
      onClick={onClick}
    >
      {label}
      {count > 0 ? (
        <span className="rounded-full bg-action-soft px-1.5 py-0.5 text-[10px] font-semibold text-ink">
          {count}
        </span>
      ) : null}
    </button>
  );
}

function MemberPanelTabs({
  activeTab,
  memberCount,
  approvalCount,
  onChange,
}: {
  activeTab: MemberPanelTab;
  memberCount: number;
  approvalCount: number;
  onChange: (tab: MemberPanelTab) => void;
}) {
  const t = useT();

  return (
    <div
      role="tablist"
      aria-label={t("members.tabs")}
      className="segmented mt-3 grid grid-cols-2 gap-1 p-1"
    >
      <PanelTab
        id="members-tab-members"
        panelId="members-panel-members"
        active={activeTab === "members"}
        label={t("members.tab.members")}
        count={memberCount}
        onClick={() => onChange("members")}
      />
      <PanelTab
        id="members-tab-approvals"
        panelId="members-panel-approvals"
        active={activeTab === "approvals"}
        label={t("members.tab.approvals")}
        count={approvalCount}
        onClick={() => onChange("approvals")}
      />
    </div>
  );
}

function MemberPanelHeader({
  isOwner,
  memberCount,
  onlineCount,
  onCollapse,
  onOpenSettings,
}: {
  isOwner: boolean;
  memberCount: number;
  onlineCount: number;
  onCollapse: () => void;
  onOpenSettings: () => void;
}) {
  const t = useT();

  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-[0.16em] text-ink-faint">
          {isOwner ? t("members.manage") : t("members.list")}
        </p>
        <p className="mt-0.5 text-sm font-semibold text-ink">
          {t("members.summary", { count: memberCount, online: onlineCount })}
        </p>
      </div>
      <div className="flex items-center gap-0.5">
        {isOwner ? (
          <Tooltip label={t("header.settings")}>
            <IconButton
              aria-label={t("header.settings")}
              className="h-8 w-8"
              onClick={onOpenSettings}
            >
              <Settings2 className="h-4 w-4" aria-hidden />
            </IconButton>
          </Tooltip>
        ) : null}
        <Tooltip label={t("members.collapse")}>
          <IconButton
            aria-label={t("members.collapse")}
            className="h-8 w-8"
            onClick={onCollapse}
          >
            <PanelRightClose className="h-4 w-4" aria-hidden />
          </IconButton>
        </Tooltip>
      </div>
    </div>
  );
}

function MembersPane({
  members,
  isOwner,
  action,
  now,
  onKick,
  onTransfer,
}: {
  members: RoomMemberItem[];
  isOwner: boolean;
  action: string | null;
  now: number;
  onKick: (member: RoomMemberItem) => void;
  onTransfer: (member: RoomMemberItem) => void;
}) {
  const t = useT();

  return (
    <div
      role={isOwner ? "tabpanel" : "region"}
      id={isOwner ? "members-panel-members" : undefined}
      aria-labelledby={isOwner ? "members-tab-members" : undefined}
      aria-label={isOwner ? undefined : t("members.list")}
      className="flex min-h-0 flex-1 flex-col"
    >
      <MemberList
        members={members}
        isOwner={isOwner}
        action={action}
        now={now}
        onKick={onKick}
        onTransfer={onTransfer}
      />
    </div>
  );
}

function ApprovalPane({
  requests,
  action,
  onReview,
}: {
  requests: PendingRequestItem[];
  action: string | null;
  onReview: (request: PendingRequestItem, action: "approve" | "reject") => void;
}) {
  return (
    <div
      role="tabpanel"
      id="members-panel-approvals"
      aria-labelledby="members-tab-approvals"
      className="flex min-h-0 flex-1 flex-col"
    >
      <ApprovalList requests={requests} action={action} onReview={onReview} />
    </div>
  );
}

function MemberPanelBody({
  activeTab,
  members,
  pendingRequests,
  isOwner,
  action,
  now,
  onKick,
  onTransfer,
  onReview,
}: {
  activeTab: MemberPanelTab;
  members: RoomMemberItem[];
  pendingRequests: PendingRequestItem[];
  isOwner: boolean;
  action: string | null;
  now: number;
  onKick: (member: RoomMemberItem) => void;
  onTransfer: (member: RoomMemberItem) => void;
  onReview: (request: PendingRequestItem, action: "approve" | "reject") => void;
}) {
  if (!isOwner || activeTab === "members") {
    return (
      <MembersPane
        members={members}
        isOwner={isOwner}
        action={action}
        now={now}
        onKick={onKick}
        onTransfer={onTransfer}
      />
    );
  }

  return <ApprovalPane requests={pendingRequests} action={action} onReview={onReview} />;
}

// 右侧成员栏：成员卡片（角色 / 在线 / 最近活跃）+ 审批流 + 房主设置入口。
// 设置入口通过 onOpenSettings 与 ui-25 设置抽屉衔接，后续替换实现无需改动本组件契约。
export function MemberPanel({
  members,
  pendingRequests,
  isOwner,
  action,
  onCollapse,
  onOpenSettings,
  onKick,
  onTransfer,
  onReview,
  now: fixedNow,
}: MemberPanelProps) {
  const [tab, setTab] = useState<MemberPanelTab>("members");
  // 每 30s 推进一次“当前时间”，让在线状态与最近活跃文案自动刷新。
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const now = fixedNow ?? clock;
  const activeTab: MemberPanelTab = isOwner ? tab : "members";
  const onlineCount = members.filter((member) => isMemberOnline(member.lastSeenAt, now)).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MemberPanelHeader
        isOwner={isOwner}
        memberCount={members.length}
        onlineCount={onlineCount}
        onCollapse={onCollapse}
        onOpenSettings={onOpenSettings}
      />
      {isOwner ? (
        <MemberPanelTabs
          activeTab={activeTab}
          memberCount={members.length}
          approvalCount={pendingRequests.length}
          onChange={setTab}
        />
      ) : null}
      <div className="mt-3 flex min-h-0 flex-1 flex-col">
        <MemberPanelBody
          activeTab={activeTab}
          members={members}
          pendingRequests={pendingRequests}
          isOwner={isOwner}
          action={action}
          now={now}
          onKick={onKick}
          onTransfer={onTransfer}
          onReview={onReview}
        />
      </div>
    </div>
  );
}
