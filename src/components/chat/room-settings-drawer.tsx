"use client";

import clsx from "clsx";
import { LoaderCircle, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Drawer } from "@/components/ui/drawer";
import { FieldError } from "@/components/ui/field-error";
import { Switch } from "@/components/ui/switch";
import { GATE_CODE_LENGTH, ROOM_NAME_MAX_LENGTH } from "@/lib/form-validation";
import { useT } from "@/lib/i18n/context";
import {
  hasGateCode,
  isGateCodeDirty,
  isRoomNameDirty,
  normalizeGateCodeInput,
  normalizeRoomNameInput,
} from "@/lib/room-settings";
import type { RoomSnapshot } from "@/types/chat";

export type RoomSettingsErrors = {
  roomName?: string;
  gateCode?: string;
};

export type RoomSettingsContentProps = {
  room: RoomSnapshot["room"];
  memberCount: number;
  roomOnline: number;
  roomNameInput: string;
  gateCodeInput: string;
  errors: RoomSettingsErrors;
  action: string | null;
  onRoomNameChange: (value: string) => void;
  onGateCodeChange: (value: string) => void;
  onSaveRoomName: () => void;
  onSaveGateCode: (nextGateCode?: string) => void;
  onToggleJoinPolicy: (next: boolean) => void;
  onToggleNeverExpire: (next: boolean) => void;
  onDissolve: () => void;
};

export type RoomSettingsDrawerProps = RoomSettingsContentProps & {
  open: boolean;
  onClose: () => void;
};

function SettingsSection({
  sectionId,
  index,
  title,
  hint,
  tone = "default",
  children,
}: {
  sectionId: string;
  index: string;
  title: string;
  hint?: string;
  tone?: "default" | "danger";
  children: ReactNode;
}) {
  const headingId = `settings-section-${sectionId}`;
  return (
    <section
      className={clsx("settings-section", tone === "danger" && "settings-section--danger")}
      aria-labelledby={headingId}
    >
      <header className="settings-section__head">
        <span className="settings-section__index" aria-hidden="true">
          {index}
        </span>
        <div>
          <h3 id={headingId} className="settings-section__title">
            {title}
          </h3>
          {hint ? <p className="settings-section__hint">{hint}</p> : null}
        </div>
      </header>
      <div className="settings-section__body">{children}</div>
    </section>
  );
}

function RoomSettingsOverview({
  room,
  memberCount,
  roomOnline,
}: Pick<RoomSettingsContentProps, "room" | "memberCount" | "roomOnline">) {
  const t = useT();
  return (
    <dl className="settings-overview" aria-label={t("settings.overview")}>
      <div className="settings-overview__item">
        <dt className="settings-overview__label">{t("settings.overview.roomCode")}</dt>
        <dd className="settings-overview__value settings-overview__value--mono">
          {room.roomCode}
        </dd>
      </div>
      <div className="settings-overview__item">
        <dt className="settings-overview__label">{t("settings.overview.owner")}</dt>
        <dd className="settings-overview__value">{room.owner.nickname}</dd>
      </div>
      <div className="settings-overview__item">
        <dt className="settings-overview__label">{t("settings.overview.members")}</dt>
        <dd className="settings-overview__value">
          {t("settings.overview.membersValue", {
            count: memberCount,
            online: roomOnline,
          })}
        </dd>
      </div>
    </dl>
  );
}

function RoomNameSection({
  room,
  roomNameInput,
  errors,
  action,
  onRoomNameChange,
  onSaveRoomName,
}: Pick<
  RoomSettingsContentProps,
  | "room"
  | "roomNameInput"
  | "errors"
  | "action"
  | "onRoomNameChange"
  | "onSaveRoomName"
>) {
  const t = useT();
  const dirty = isRoomNameDirty(roomNameInput, room.name);
  const saving = action === "room-name";
  const describedBy = [
    errors.roomName ? "settings-room-name-error" : null,
    "settings-room-name-counter",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <SettingsSection
      sectionId="room-name"
      index="01"
      title={t("settings.roomName")}
      hint={t("settings.roomName.hint", { max: ROOM_NAME_MAX_LENGTH })}
    >
      <div className="settings-field">
        <label className="settings-field__label" htmlFor="settings-room-name">
          {t("settings.roomName.field")}
        </label>
        <div className="settings-field__row">
          <input
            id="settings-room-name"
            className="field settings-field__input"
            value={roomNameInput}
            onChange={(event) => onRoomNameChange(normalizeRoomNameInput(event.target.value))}
            placeholder={t("settings.roomName.placeholder")}
            maxLength={ROOM_NAME_MAX_LENGTH}
            autoComplete="off"
            aria-invalid={errors.roomName ? true : undefined}
            aria-describedby={describedBy}
          />
          <button
            type="button"
            className="btn-primary btn-sm settings-field__action"
            onClick={onSaveRoomName}
            disabled={!dirty || saving}
          >
            {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
            {saving ? t("settings.saving") : t("settings.save")}
          </button>
        </div>
        <div className="settings-field__meta">
          <FieldError id="settings-room-name-error" message={errors.roomName} />
          <span id="settings-room-name-counter" className="settings-counter">
            {roomNameInput.length}/{ROOM_NAME_MAX_LENGTH}
          </span>
        </div>
      </div>
    </SettingsSection>
  );
}

function GateCodeSection({
  room,
  gateCodeInput,
  errors,
  action,
  onGateCodeChange,
  onSaveGateCode,
}: Pick<
  RoomSettingsContentProps,
  | "room"
  | "gateCodeInput"
  | "errors"
  | "action"
  | "onGateCodeChange"
  | "onSaveGateCode"
>) {
  const t = useT();
  const dirty = isGateCodeDirty(gateCodeInput, room.gateCode);
  const saving = action === "gate-code";
  const describedBy = [
    errors.gateCode ? "settings-gate-code-error" : null,
    "settings-gate-code-counter",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <SettingsSection
      sectionId="gate-code"
      index="02"
      title={t("settings.gateCode")}
      hint={t("settings.gateCode.hint")}
    >
      <div className="settings-field">
        <label className="settings-field__label" htmlFor="settings-gate-code">
          {t("settings.gateCode.field")}
        </label>
        <div className="settings-field__row">
          <input
            id="settings-gate-code"
            className="field settings-field__input settings-field__input--code"
            value={gateCodeInput}
            onChange={(event) => onGateCodeChange(normalizeGateCodeInput(event.target.value))}
            placeholder={t("settings.gateCode.placeholder")}
            maxLength={GATE_CODE_LENGTH}
            inputMode="numeric"
            autoComplete="off"
            aria-invalid={errors.gateCode ? true : undefined}
            aria-describedby={describedBy}
          />
          <button
            type="button"
            className="btn-primary btn-sm settings-field__action"
            onClick={() => onSaveGateCode()}
            disabled={!dirty || saving}
          >
            {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
            {saving ? t("settings.saving") : t("settings.save")}
          </button>
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => onSaveGateCode("")}
            disabled={!hasGateCode(room.gateCode) || saving}
          >
            {t("settings.gateCode.clear")}
          </button>
        </div>
        <div className="settings-field__meta">
          <FieldError id="settings-gate-code-error" message={errors.gateCode} />
          <span id="settings-gate-code-counter" className="settings-counter">
            {gateCodeInput.length}/{GATE_CODE_LENGTH}
          </span>
        </div>
        <p className="settings-field__note">
          {t("settings.gateCode.current", {
            code: room.gateCode ?? t("settings.gateCode.unset"),
          })}
        </p>
      </div>
    </SettingsSection>
  );
}

function SettingSwitchRow({
  controlId,
  title,
  hint,
  checked,
  disabled,
  statusLabel,
  onToggle,
}: {
  controlId: string;
  title: string;
  hint: string;
  checked: boolean;
  disabled: boolean;
  statusLabel: string;
  onToggle: () => void;
}) {
  const labelId = `${controlId}-label`;
  return (
    <div className="settings-switch">
      <div className="settings-switch__copy">
        <p id={labelId} className="settings-switch__title">
          {title}
        </p>
        <p className="settings-switch__hint">{hint}</p>
      </div>
      <div className="settings-switch__control">
        <span className={clsx("settings-status", checked && "settings-status--on")}>
          {statusLabel}
        </span>
        <Switch
          checked={checked}
          disabled={disabled}
          labelledBy={labelId}
          onToggle={onToggle}
        />
      </div>
    </div>
  );
}

function JoinPolicySection({
  room,
  action,
  onToggleJoinPolicy,
}: Pick<RoomSettingsContentProps, "room" | "action" | "onToggleJoinPolicy">) {
  const t = useT();
  return (
    <SettingsSection
      sectionId="join-policy"
      index="03"
      title={t("settings.joinPolicy.title")}
    >
      <SettingSwitchRow
        controlId="settings-join-policy"
        title={t("settings.joinPolicy")}
        hint={t("settings.joinPolicy.hint")}
        checked={room.allowJoinRequest}
        disabled={action === "join-policy"}
        statusLabel={
          room.allowJoinRequest
            ? t("settings.joinPolicy.allow")
            : t("settings.joinPolicy.deny")
        }
        onToggle={() => onToggleJoinPolicy(!room.allowJoinRequest)}
      />
    </SettingsSection>
  );
}

function ExpirySection({
  room,
  action,
  onToggleNeverExpire,
}: Pick<RoomSettingsContentProps, "room" | "action" | "onToggleNeverExpire">) {
  const t = useT();
  return (
    <SettingsSection
      sectionId="expiry"
      index="04"
      title={t("settings.expiry.title")}
    >
      <SettingSwitchRow
        controlId="settings-expiry"
        title={t("settings.expiry")}
        hint={t("settings.expiry.hint")}
        checked={room.neverExpire}
        disabled={action === "never-expire"}
        statusLabel={
          room.neverExpire ? t("settings.expiry.on") : t("settings.expiry.off")
        }
        onToggle={() => onToggleNeverExpire(!room.neverExpire)}
      />
    </SettingsSection>
  );
}

function DangerSection({
  room,
  action,
  onDissolve,
}: Pick<RoomSettingsContentProps, "room" | "action" | "onDissolve">) {
  const t = useT();
  const [confirming, setConfirming] = useState(false);
  const dissolving = action === "dissolve";

  return (
    <SettingsSection
      sectionId="danger"
      index="05"
      title={t("settings.danger")}
      hint={t("settings.danger.hint")}
      tone="danger"
    >
      <div className="settings-danger">
        <p className="settings-danger__hint">{t("settings.danger.dissolveHint")}</p>
        {confirming ? (
          <div className="settings-danger__confirm" role="alert">
            <p className="settings-danger__question">
              {t("settings.danger.confirm", { name: room.name })}
            </p>
            <div className="settings-danger__actions">
              <button
                type="button"
                className="btn-danger btn-sm"
                onClick={onDissolve}
                disabled={dissolving}
              >
                {dissolving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                {dissolving
                  ? t("settings.danger.dissolving")
                  : t("settings.danger.confirmAction")}
              </button>
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => setConfirming(false)}
                disabled={dissolving}
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="btn-danger btn-sm settings-danger__trigger"
            onClick={() => setConfirming(true)}
          >
            <Trash2 className="h-4 w-4" />
            {t("settings.danger.dissolve")}
          </button>
        )}
      </div>
    </SettingsSection>
  );
}

export function RoomSettingsContent(props: RoomSettingsContentProps) {
  return (
    <div className="settings-drawer">
      <RoomSettingsOverview
        room={props.room}
        memberCount={props.memberCount}
        roomOnline={props.roomOnline}
      />
      <RoomNameSection
        room={props.room}
        roomNameInput={props.roomNameInput}
        errors={props.errors}
        action={props.action}
        onRoomNameChange={props.onRoomNameChange}
        onSaveRoomName={props.onSaveRoomName}
      />
      <GateCodeSection
        room={props.room}
        gateCodeInput={props.gateCodeInput}
        errors={props.errors}
        action={props.action}
        onGateCodeChange={props.onGateCodeChange}
        onSaveGateCode={props.onSaveGateCode}
      />
      <JoinPolicySection
        room={props.room}
        action={props.action}
        onToggleJoinPolicy={props.onToggleJoinPolicy}
      />
      <ExpirySection
        room={props.room}
        action={props.action}
        onToggleNeverExpire={props.onToggleNeverExpire}
      />
      <DangerSection
        room={props.room}
        action={props.action}
        onDissolve={props.onDissolve}
      />
    </div>
  );
}

export function RoomSettingsDrawer({
  open,
  onClose,
  ...contentProps
}: RoomSettingsDrawerProps) {
  const t = useT();
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={t("settings.title")}
      description={t("settings.description")}
      closeLabel={t("common.close")}
      side="right"
      size="lg"
      bodyClassName="settings-drawer-body"
      footer={
        <div className="flex justify-end">
          <button type="button" className="btn-primary btn-sm" onClick={onClose}>
            {t("settings.done")}
          </button>
        </div>
      }
    >
      <RoomSettingsContent {...contentProps} />
    </Drawer>
  );
}
