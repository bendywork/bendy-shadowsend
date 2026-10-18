"use client";

import type { Dispatch, SetStateAction } from "react";
import { SwitchBtn } from "@/components/room/switch-btn";
import type { SettingsErrors } from "@/components/room/room-page-types";
import { FieldError } from "@/components/ui/field-error";
import { Popover } from "@/components/ui/popover";
import { useT } from "@/lib/i18n/context";
import type { RoomSnapshot } from "@/types/chat";

type Props = {
  open: boolean;
  onClose: () => void;
  snap: RoomSnapshot;
  action: string | null;
  roomNameInput: string;
  gateCodeInput: string;
  settingsErrors: SettingsErrors;
  setRoomNameInput: (value: string) => void;
  setGateCodeInput: (value: string) => void;
  setSettingsErrors: Dispatch<SetStateAction<SettingsErrors>>;
  updateRoomName: () => void;
  updateGateCode: () => void;
  updateJoinPolicy: (nextAllowJoinRequest: boolean) => void;
  updateNeverExpire: (nextNeverExpire: boolean) => void;
};

export function RoomSettingsPopover({
  open,
  onClose,
  snap,
  action,
  roomNameInput,
  gateCodeInput,
  settingsErrors,
  setRoomNameInput,
  setGateCodeInput,
  setSettingsErrors,
  updateRoomName,
  updateGateCode,
  updateJoinPolicy,
  updateNeverExpire,
}: Props) {
  const t = useT();

  return (
    <Popover
      open={open}
      onClose={onClose}
      title={t("settings.title")}
      closeLabel={t("common.close")}
    >
      <div className="space-y-3">
        <div className="rounded-lg border border-line-subtle bg-panel/70 p-2.5">
          <p className="text-xs font-medium text-ink-soft">
            {t("settings.roomName")}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <input
              value={roomNameInput}
              onChange={(e) => {
                setRoomNameInput(e.target.value.slice(0, 48));
                if (settingsErrors.roomName) {
                  setSettingsErrors((prev) => ({
                    ...prev,
                    roomName: undefined,
                  }));
                }
              }}
              placeholder={t("settings.roomName.placeholder")}
              className="w-full rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs text-ink outline-none"
              aria-invalid={settingsErrors.roomName ? true : undefined}
              aria-describedby={
                settingsErrors.roomName ? "settings-room-name-error" : undefined
              }
            />
            <button
              type="button"
              onClick={updateRoomName}
              disabled={action === "room-name"}
              className="shrink-0 rounded-lg bg-elevated-strong px-2.5 py-1.5 text-xs text-ink disabled:opacity-60"
            >
              {action === "room-name"
                ? t("settings.saving")
                : t("settings.save")}
            </button>
          </div>
          <FieldError
            id="settings-room-name-error"
            message={settingsErrors.roomName}
          />
        </div>
        <div className="rounded-lg border border-line-subtle bg-panel/70 p-2.5">
          <p className="text-xs font-medium text-ink-soft">
            {t("settings.gateCode")}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <input
              value={gateCodeInput}
              onChange={(e) => {
                setGateCodeInput(e.target.value.replace(/\D/g, "").slice(0, 6));
                if (settingsErrors.gateCode) {
                  setSettingsErrors((prev) => ({
                    ...prev,
                    gateCode: undefined,
                  }));
                }
              }}
              placeholder={t("settings.gateCode.placeholder")}
              className="w-full rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs text-ink outline-none"
              aria-invalid={settingsErrors.gateCode ? true : undefined}
              aria-describedby={
                settingsErrors.gateCode ? "settings-gate-code-error" : undefined
              }
            />
            <button
              type="button"
              onClick={updateGateCode}
              disabled={action === "gate-code"}
              className="shrink-0 rounded-lg bg-elevated-strong px-2.5 py-1.5 text-xs text-ink disabled:opacity-60"
            >
              {action === "gate-code"
                ? t("settings.saving")
                : t("settings.save")}
            </button>
          </div>
          <FieldError
            id="settings-gate-code-error"
            message={settingsErrors.gateCode}
          />
          <p className="mt-2 text-[11px] text-ink-faint">
            {t("settings.gateCode.current", {
              code: snap.room.gateCode ?? t("settings.gateCode.unset"),
            })}
          </p>
        </div>
        <div className="rounded-lg border border-line-subtle bg-panel/70 p-2.5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-ink-soft">
                {t("settings.joinPolicy")}
              </p>
              <p className="text-[11px] text-ink-faint">
                {t("settings.joinPolicy.hint")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-ink-muted">
                {snap.room.allowJoinRequest
                  ? t("settings.joinPolicy.allow")
                  : t("settings.joinPolicy.deny")}
              </span>
              <SwitchBtn
                checked={snap.room.allowJoinRequest}
                disabled={action === "join-policy"}
                onToggle={() => {
                  void updateJoinPolicy(!snap.room.allowJoinRequest);
                }}
              />
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-line-subtle bg-panel/70 p-2.5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-ink-soft">
                {t("settings.expiry")}
              </p>
              <p className="text-[11px] text-ink-faint">
                {t("settings.expiry.hint")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-ink-muted">
                {snap.room.neverExpire
                  ? t("settings.expiry.on")
                  : t("settings.expiry.off")}
              </span>
              <SwitchBtn
                checked={snap.room.neverExpire}
                disabled={action === "never-expire"}
                onToggle={() => {
                  void updateNeverExpire(!snap.room.neverExpire);
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </Popover>
  );
}
