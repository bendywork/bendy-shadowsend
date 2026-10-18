"use client";

import { ArrowRight, DoorOpen, PlusCircle } from "lucide-react";
import { Avatar } from "@/components/chat/avatar";
import { MAX_USER_ROOMS } from "@/lib/constants";
import { useT } from "@/lib/i18n/context";
import type { ClientUser, RoomTreeItem } from "@/types/chat";

type IdentityCardProps = {
  me: ClientUser;
  createdRooms: RoomTreeItem[];
  joinedRooms: RoomTreeItem[];
  roomsLoaded: boolean;
  onEnterRoom: (roomCode: string) => void;
  onJoin: () => void;
  onCreate: () => void;
};

function latestRoom(createdRooms: RoomTreeItem[], joinedRooms: RoomTreeItem[]): RoomTreeItem | null {
  const rooms = [...createdRooms, ...joinedRooms];
  if (rooms.length === 0) return null;

  return rooms.reduce((latest, room) => {
    const roomTime = Date.parse(room.createdAt) || 0;
    const latestTime = Date.parse(latest.createdAt) || 0;
    return roomTime > latestTime ? room : latest;
  });
}

export function IdentityCard({
  me,
  createdRooms,
  joinedRooms,
  roomsLoaded,
  onEnterRoom,
  onJoin,
  onCreate,
}: IdentityCardProps) {
  const t = useT();
  const totalRooms = createdRooms.length + joinedRooms.length;
  const recentRoom = latestRoom(createdRooms, joinedRooms);
  const quotaPercent = Math.min(100, Math.round((totalRooms / MAX_USER_ROOMS) * 100));

  return (
    <section className="home-identity" aria-labelledby="home-identity-title">
      <div className="home-identity__head">
        <Avatar
          initial={me.avatarInitial}
          color={me.avatarColor}
          className="h-11 w-11 shrink-0 text-base"
        />
        <div className="home-identity__who">
          <p className="home-identity__eyebrow">{t("home.identity.current")}</p>
          <h2 id="home-identity-title" className="home-identity__name">
            {me.nickname}
          </h2>
        </div>
        <span className="home-identity__badge">{t("home.identity.badge")}</span>
      </div>

      <dl className="home-identity__stats">
        <div className="home-identity__stat">
          <dt>{t("home.identity.created")}</dt>
          <dd>{roomsLoaded ? createdRooms.length : "—"}</dd>
        </div>
        <div className="home-identity__stat">
          <dt>{t("home.identity.joined")}</dt>
          <dd>{roomsLoaded ? joinedRooms.length : "—"}</dd>
        </div>
        <div className="home-identity__stat home-identity__stat--quota">
          <dt>{t("home.identity.quota")}</dt>
          <dd>
            {roomsLoaded
              ? t("home.identity.quotaValue", { count: totalRooms, max: MAX_USER_ROOMS })
              : "—"}
          </dd>
        </div>
      </dl>

      <div
        className="home-identity__meter"
        role="progressbar"
        aria-label={t("home.identity.quotaLabel")}
        aria-valuemin={0}
        aria-valuemax={MAX_USER_ROOMS}
        aria-valuenow={roomsLoaded ? totalRooms : 0}
      >
        <span style={{ transform: `scaleX(${roomsLoaded ? quotaPercent / 100 : 0})` }} />
      </div>

      <div className="home-identity__actions">
        {recentRoom ? (
          <button
            type="button"
            className="home-identity__recent"
            onClick={() => onEnterRoom(recentRoom.roomCode)}
            aria-label={t("home.identity.enterRoom", { name: recentRoom.name })}
          >
            <span className="home-identity__recent-copy">
              <span className="home-identity__recent-label">{t("home.identity.recent")}</span>
              <span className="home-identity__recent-name">{recentRoom.name}</span>
              <span className="home-identity__recent-code">{recentRoom.roomCode}</span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
          </button>
        ) : (
          <p className="home-identity__empty">
            {roomsLoaded ? t("home.identity.empty") : t("home.identity.loading")}
          </p>
        )}

        <div className="home-identity__buttons">
          <button type="button" className="btn-ghost btn-sm" onClick={onJoin}>
            <DoorOpen className="h-3.5 w-3.5" aria-hidden />
            {t("home.identity.action.join")}
          </button>
          <button type="button" className="btn-ghost btn-sm" onClick={onCreate}>
            <PlusCircle className="h-3.5 w-3.5" aria-hidden />
            {t("home.identity.action.create")}
          </button>
        </div>
      </div>
    </section>
  );
}

export function IdentityCardSkeleton() {
  return (
    <section className="home-identity home-identity--skeleton" aria-hidden="true">
      <div className="home-identity__head">
        <span className="home-identity__skeleton-avatar" />
        <div className="home-identity__skeleton-copy">
          <span className="home-identity__skeleton-line home-identity__skeleton-line--short" />
          <span className="home-identity__skeleton-line" />
        </div>
      </div>
      <div className="home-identity__skeleton-stats">
        <span />
        <span />
        <span />
      </div>
    </section>
  );
}
