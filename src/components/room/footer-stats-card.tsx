"use client";

import { useId } from "react";
import { Avatar } from "@/components/chat/avatar";
import { useT } from "@/lib/i18n/context";
import type { RoomSnapshot } from "@/types/chat";

export type FooterStatsLabels = {
  overview: string;
  live: string;
  version: string;
  license: string;
  roomOnline: string;
  totalOnline: string;
  currentUser: string;
  owner: string;
  member: string;
};

type FooterStatsCardContentProps = {
  app: RoomSnapshot["app"];
  stats: RoomSnapshot["stats"];
  me: RoomSnapshot["me"];
  labels: FooterStatsLabels;
};

type FooterStatsCardProps = Omit<FooterStatsCardContentProps, "labels">;

/**
 * 房间页侧栏页脚统计卡（REQ-202610-0505 / ui-42）。
 *
 * 信息层级：概览标题与实时状态 → 两项在线指标 → 当前用户与角色 → 版本/协议元信息。
 * 纯展示层独立导出，便于 SSR 测试；所有颜色与间距来自语义令牌。
 */
export function FooterStatsCardContent({
  app,
  stats,
  me,
  labels,
}: FooterStatsCardContentProps) {
  const headingId = useId();
  const roleLabel = me.role === "OWNER" ? labels.owner : labels.member;

  return (
    <section
      aria-labelledby={headingId}
      className="mt-auto overflow-hidden rounded-xl bg-panel/75 shadow-sm ring-1 ring-line-subtle/60"
    >
      <div className="flex items-center justify-between gap-2 px-3 pt-3">
        <h3
          id={headingId}
          className="text-[10px] font-medium uppercase tracking-[0.18em] text-ink-faint"
        >
          {labels.overview}
        </h3>
        <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-ink-muted">
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 rounded-full bg-success ring-2 ring-success-soft"
          />
          {labels.live}
        </span>
      </div>

      <dl className="mx-3 mt-2.5 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-elevated/45 px-2.5 py-2">
          <dt className="text-[10px] leading-4 text-ink-muted">{labels.roomOnline}</dt>
          <dd className="mt-0.5 text-xl font-semibold leading-6 tracking-tight tabular-nums text-ink">
            {stats.roomOnline}
          </dd>
        </div>
        <div className="rounded-lg bg-elevated/45 px-2.5 py-2">
          <dt className="text-[10px] leading-4 text-ink-muted">{labels.totalOnline}</dt>
          <dd className="mt-0.5 text-xl font-semibold leading-6 tracking-tight tabular-nums text-ink">
            {stats.totalOnline}
          </dd>
        </div>
      </dl>

      <div className="mx-3 mt-2 flex items-center gap-2.5 rounded-lg bg-elevated/30 px-2.5 py-2">
        <Avatar
          initial={me.avatarInitial}
          color={me.avatarColor}
          className="shrink-0"
        />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] leading-4 text-ink-faint">{labels.currentUser}</p>
          <p className="truncate text-sm font-medium leading-5 text-ink">{me.nickname}</p>
        </div>
        <span className="chip shrink-0">{roleLabel}</span>
      </div>

      <footer className="mx-3 mt-2.5 flex items-center justify-between gap-2 border-t border-line-subtle/60 pt-2 pb-3 text-[10px] text-ink-faint">
        <span>
          {labels.version}{" "}
          <span className="font-medium tabular-nums text-ink-muted">{app.version}</span>
        </span>
        <span>
          {labels.license}{" "}
          <span className="font-medium text-ink-muted">{app.openSource}</span>
        </span>
      </footer>
    </section>
  );
}

export function FooterStatsCard({ app, stats, me }: FooterStatsCardProps) {
  const t = useT();

  return (
    <FooterStatsCardContent
      app={app}
      stats={stats}
      me={me}
      labels={{
        overview: t("footer.overview"),
        live: t("footer.live"),
        version: t("footer.version"),
        license: t("footer.license"),
        roomOnline: t("footer.roomOnline"),
        totalOnline: t("footer.totalOnline"),
        currentUser: t("footer.currentUser"),
        owner: t("members.role.owner"),
        member: t("members.role.member"),
      }}
    />
  );
}
