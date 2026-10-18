"use client";

import type { Dispatch, FormEvent, SetStateAction } from "react";
import { LoaderCircle, Plus, X } from "lucide-react";
import type {
  RoomEntryErrors,
  RoomEntryMode,
} from "@/components/room/room-page-types";
import { FieldError } from "@/components/ui/field-error";
import { MAX_USER_ROOMS } from "@/lib/constants";

type Props = {
  roomEntryMode: RoomEntryMode;
  roomEntrySubmitting: boolean;
  roomEntryErrors: RoomEntryErrors;
  roomCount: number;
  canAddMoreRooms: boolean;
  createName: string;
  createGateCode: string;
  joinRoomCode: string;
  joinGateCode: string;
  joinInviteToken: string;
  setRoomEntryMode: (mode: RoomEntryMode) => void;
  setRoomEntryErrors: Dispatch<SetStateAction<RoomEntryErrors>>;
  setCreateName: (value: string) => void;
  setCreateGateCode: (value: string) => void;
  setJoinRoomCode: (value: string) => void;
  setJoinGateCode: (value: string) => void;
  setJoinInviteToken: (value: string) => void;
  quickCreateRoom: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  quickJoinRoom: (event: FormEvent<HTMLFormElement>) => Promise<void>;
};

export function RoomEntryDialog({
  roomEntryMode,
  roomEntrySubmitting,
  roomEntryErrors,
  roomCount,
  canAddMoreRooms,
  createName,
  createGateCode,
  joinRoomCode,
  joinGateCode,
  joinInviteToken,
  setRoomEntryMode,
  setRoomEntryErrors,
  setCreateName,
  setCreateGateCode,
  setJoinRoomCode,
  setJoinGateCode,
  setJoinInviteToken,
  quickCreateRoom,
  quickJoinRoom,
}: Props) {
  if (!roomEntryMode) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay-strong p-4">
      <section className="w-full max-w-md rounded-2xl border border-line bg-canvas p-5 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-ink">
              {roomEntryMode === "create" ? "创建房间" : "加入房间"}
            </h3>
            <p className="mt-1 text-[11px] text-ink-faint">
              当前已加入/创建房间数：{roomCount}/{MAX_USER_ROOMS}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setRoomEntryMode(null)}
            className="rounded-md border border-line p-1 text-ink-soft hover:bg-elevated"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {roomEntryMode === "create" ? (
          <form className="space-y-3" onSubmit={quickCreateRoom} noValidate>
            <label className="block space-y-1">
              <span className="text-xs text-ink-muted">房间名称</span>
              <input
                value={createName}
                onChange={(event) => {
                  setCreateName(event.target.value);
                  if (roomEntryErrors.name) {
                    setRoomEntryErrors((prev) => ({
                      ...prev,
                      name: undefined,
                    }));
                  }
                }}
                placeholder="输入房间名"
                className="w-full rounded-xl border border-line bg-panel/80 px-3 py-2 text-sm text-ink outline-none ring-action-border transition-ui focus:ring"
                aria-invalid={roomEntryErrors.name ? true : undefined}
                aria-describedby={
                  roomEntryErrors.name
                    ? "room-entry-create-name-error"
                    : undefined
                }
              />
              <FieldError
                id="room-entry-create-name-error"
                message={roomEntryErrors.name}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-ink-muted">
                门禁码（可选，6位数字）
              </span>
              <input
                value={createGateCode}
                onChange={(event) => {
                  setCreateGateCode(
                    event.target.value.replace(/\D/g, "").slice(0, 6),
                  );
                  if (roomEntryErrors.gateCode) {
                    setRoomEntryErrors((prev) => ({
                      ...prev,
                      gateCode: undefined,
                    }));
                  }
                }}
                placeholder="不填则加入无需门禁码"
                className="w-full rounded-xl border border-line bg-panel/80 px-3 py-2 text-sm text-ink outline-none ring-action-border transition-ui focus:ring"
                aria-invalid={roomEntryErrors.gateCode ? true : undefined}
                aria-describedby={
                  roomEntryErrors.gateCode
                    ? "room-entry-create-gate-code-error"
                    : undefined
                }
              />
              <FieldError
                id="room-entry-create-gate-code-error"
                message={roomEntryErrors.gateCode}
              />
            </label>
            <button
              type="submit"
              disabled={roomEntrySubmitting || !canAddMoreRooms}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-elevated-strong px-4 py-2.5 text-sm font-semibold text-ink transition-ui hover:bg-elevated-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {roomEntrySubmitting ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              创建并进入
            </button>
          </form>
        ) : (
          <form className="space-y-3" onSubmit={quickJoinRoom} noValidate>
            <label className="block space-y-1">
              <span className="text-xs text-ink-muted">
                房间号（URL 随机码）
              </span>
              <input
                value={joinRoomCode}
                onChange={(event) => {
                  setJoinRoomCode(event.target.value.trim());
                  if (roomEntryErrors.roomCode) {
                    setRoomEntryErrors((prev) => ({
                      ...prev,
                      roomCode: undefined,
                    }));
                  }
                }}
                placeholder="例如：8DK1A2M7QX"
                className="w-full rounded-xl border border-line bg-panel/80 px-3 py-2 text-sm text-ink outline-none ring-action-border transition-ui focus:ring"
                aria-invalid={roomEntryErrors.roomCode ? true : undefined}
                aria-describedby={
                  roomEntryErrors.roomCode
                    ? "room-entry-join-room-code-error"
                    : undefined
                }
              />
              <FieldError
                id="room-entry-join-room-code-error"
                message={roomEntryErrors.roomCode}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-ink-muted">
                门禁码（可选，6位数字）
              </span>
              <input
                value={joinGateCode}
                onChange={(event) => {
                  setJoinGateCode(
                    event.target.value.replace(/\D/g, "").slice(0, 6),
                  );
                  if (roomEntryErrors.gateCode) {
                    setRoomEntryErrors((prev) => ({
                      ...prev,
                      gateCode: undefined,
                    }));
                  }
                }}
                placeholder="如果房间设置了门禁码则必填"
                className="w-full rounded-xl border border-line bg-panel/80 px-3 py-2 text-sm text-ink outline-none ring-action-border transition-ui focus:ring"
                aria-invalid={roomEntryErrors.gateCode ? true : undefined}
                aria-describedby={
                  roomEntryErrors.gateCode
                    ? "room-entry-join-gate-code-error"
                    : undefined
                }
              />
              <FieldError
                id="room-entry-join-gate-code-error"
                message={roomEntryErrors.gateCode}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-ink-muted">
                邀请 Token（可选）
              </span>
              <input
                value={joinInviteToken}
                onChange={(event) =>
                  setJoinInviteToken(event.target.value.trim())
                }
                placeholder="有邀请链接时填入"
                className="w-full rounded-xl border border-line bg-panel/80 px-3 py-2 text-sm text-ink outline-none ring-action-border transition-ui focus:ring"
              />
            </label>
            <button
              type="submit"
              disabled={roomEntrySubmitting || !canAddMoreRooms}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-elevated-strong px-4 py-2.5 text-sm font-semibold text-ink transition-ui hover:bg-elevated-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {roomEntrySubmitting ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              加入房间
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
