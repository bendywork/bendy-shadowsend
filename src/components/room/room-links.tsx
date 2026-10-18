"use client";

import clsx from "clsx";
import Link from "next/link";
import { MoreHorizontal, Shield } from "lucide-react";
import type { RoomTreeItem } from "@/types/chat";

export function RoomLinks({
  rooms,
  activeCode,
  onToggleMenu,
  emptyLabel = "暂无",
}: {
  rooms: RoomTreeItem[];
  activeCode: string;
  onToggleMenu: (room: RoomTreeItem, triggerButton: HTMLButtonElement) => void;
  emptyLabel?: string;
}) {
  return (
    <div className="space-y-1">
      {rooms.length === 0 ? (
        <p className="rounded-lg border border-line-subtle bg-panel/60 px-3 py-2 text-xs text-ink-faint">
          {emptyLabel}
        </p>
      ) : (
        rooms.map((r) => (
          <div
            key={r.id}
            className={clsx(
              "rounded-lg border px-3 py-2 text-sm",
              activeCode === r.roomCode
                ? "border-action-border bg-action-soft text-ink"
                : "border-line-subtle bg-panel/70 text-ink-soft hover:border-line",
            )}
          >
            <div className="flex items-start gap-2">
              <Link href={`/room/${r.roomCode}`} className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate">{r.name}</span>
                  {activeCode === r.roomCode ? (
                    <span
                      title="当前房间"
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-success shadow-[0_0_8px_var(--ds-success-glow)]"
                    />
                  ) : null}
                  {r.hasGateCode ? (
                    <Shield className="h-3.5 w-3.5 shrink-0 text-ink-soft" />
                  ) : null}
                </div>
                <p className="mt-1 truncate font-mono text-[11px] text-ink-faint">
                  {r.roomCode}
                </p>
              </Link>
              {r.role === "MEMBER" ? (
                <button
                  type="button"
                  aria-label="房间操作"
                  aria-haspopup="menu"
                  data-room-menu-trigger={r.id}
                  onClick={(event) => onToggleMenu(r, event.currentTarget)}
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-line text-ink-soft hover:bg-elevated"
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
