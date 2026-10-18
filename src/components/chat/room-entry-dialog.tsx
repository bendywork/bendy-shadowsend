"use client";

import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import clsx from "clsx";
import { DoorOpen, LoaderCircle, PlusCircle, Sparkles } from "lucide-react";
import { Popover } from "@/components/ui/popover";
import { Field, SegmentedControl, TextInput } from "@/components/ui/form-controls";
import { useT } from "@/lib/i18n/context";
import type { MessageKey } from "@/lib/i18n/messages";
import {
  GATE_CODE_LENGTH,
  ROOM_CODE_MAX_LENGTH,
  ROOM_CODE_MIN_LENGTH,
  ROOM_NAME_MAX_LENGTH,
} from "@/lib/form-validation";
import {
  clearRoomEntryFieldError,
  getRoomEntryErrorField,
  getRoomEntryErrorParams,
  getRoomEntrySubmitKey,
  hasRoomEntryErrors,
  INITIAL_ROOM_ENTRY_VALUES,
  normalizeRoomEntryField,
  validateRoomEntryValues,
  type RoomEntryCreateValues,
  type RoomEntryFieldErrors,
  type RoomEntryJoinValues,
  type RoomEntryMode,
  type RoomEntryValues,
} from "@/lib/room-entry";

type FieldChangeHandler = (field: keyof RoomEntryValues, value: string) => void;

type FormProps = {
  values: RoomEntryValues;
  errors: RoomEntryFieldErrors;
  submitting: boolean;
  canAddMoreRooms: boolean;
  onFieldChange: FieldChangeHandler;
  onSubmit: () => void;
};

type ErrorFocusRefs = {
  nameRef?: RefObject<HTMLInputElement | null>;
  roomCodeRef?: RefObject<HTMLInputElement | null>;
  gateCodeRef?: RefObject<HTMLInputElement | null>;
};

function useFocusFirstError(
  mode: RoomEntryMode,
  errors: RoomEntryFieldErrors,
  refs: ErrorFocusRefs,
) {
  useEffect(() => {
    if (mode === "create") {
      if (errors.name) refs.nameRef?.current?.focus();
      else if (errors.gateCode) refs.gateCodeRef?.current?.focus();
      return;
    }
    if (errors.roomCode) refs.roomCodeRef?.current?.focus();
    else if (errors.gateCode) refs.gateCodeRef?.current?.focus();
  }, [mode, errors, refs.nameRef, refs.gateCodeRef, refs.roomCodeRef]);
}

function useFieldErrorText(key: MessageKey | undefined): string | undefined {
  const t = useT();
  return key ? t(key, getRoomEntryErrorParams(key)) : undefined;
}

function GateCodeField({
  id,
  value,
  error,
  label,
  placeholder,
  hint,
  inputRef,
  onChange,
}: {
  id: string;
  value: string;
  error?: MessageKey;
  label: string;
  placeholder: string;
  hint: string;
  inputRef: RefObject<HTMLInputElement | null>;
  onChange: (value: string) => void;
}) {
  const errorText = useFieldErrorText(error);
  return (
    <Field
      id={id}
      label={label}
      hint={hint}
      error={errorText}
      counter={`${value.length}/${GATE_CODE_LENGTH}`}
    >
      <TextInput
        ref={inputRef}
        name="gateCode"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="px-4 py-2.5 text-sm"
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
      />
    </Field>
  );
}

function RoomCodeField({
  value,
  error,
  inputRef,
  onChange,
}: {
  value: string;
  error?: MessageKey;
  inputRef: RefObject<HTMLInputElement | null>;
  onChange: (value: string) => void;
}) {
  const t = useT();
  return (
    <Field
      id="room-entry-join-room-code"
      label={t("roomEntry.join.roomCode.label")}
      hint={t("roomEntry.join.roomCode.hint", {
        min: ROOM_CODE_MIN_LENGTH,
        max: ROOM_CODE_MAX_LENGTH,
      })}
      error={error ? t(error, getRoomEntryErrorParams(error)) : undefined}
      required
    >
      <TextInput
        ref={inputRef}
        name="roomCode"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={t("roomEntry.join.roomCode.placeholder")}
        className="px-4 py-2.5 text-sm"
        autoComplete="off"
        spellCheck={false}
      />
    </Field>
  );
}

function InviteTokenField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useT();
  return (
    <Field
      id="room-entry-join-invite-token"
      label={t("roomEntry.join.invite.label")}
      hint={t("roomEntry.join.invite.hint")}
    >
      <TextInput
        name="inviteToken"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={t("roomEntry.join.invite.placeholder")}
        className="px-4 py-2.5 text-sm"
        autoComplete="off"
        spellCheck={false}
      />
    </Field>
  );
}

function CreateNameField({
  value,
  error,
  inputRef,
  onChange,
}: {
  value: string;
  error?: MessageKey;
  inputRef: RefObject<HTMLInputElement | null>;
  onChange: (value: string) => void;
}) {
  const t = useT();
  const overLimit = value.length > ROOM_NAME_MAX_LENGTH;
  return (
    <Field
      id="room-entry-create-name"
      label={t("roomEntry.create.name.label")}
      hint={t("roomEntry.create.name.hint", { max: ROOM_NAME_MAX_LENGTH })}
      error={error ? t(error, getRoomEntryErrorParams(error)) : undefined}
      counter={
        <span className={clsx(overLimit && "text-danger")}>
          {value.length}/{ROOM_NAME_MAX_LENGTH}
        </span>
      }
      required
    >
      <TextInput
        ref={inputRef}
        name="name"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={t("roomEntry.create.name.placeholder")}
        className="px-4 py-2.5 text-sm"
        autoComplete="off"
      />
    </Field>
  );
}

function SubmitButton({
  mode,
  submitting,
  disabled,
}: {
  mode: RoomEntryMode;
  submitting: boolean;
  disabled: boolean;
}) {
  const t = useT();
  return (
    <button
      type="submit"
      disabled={submitting || disabled}
      className="btn-primary inline-flex w-full items-center justify-center gap-2 px-4 py-3 text-sm font-semibold"
    >
      {submitting ? (
        <LoaderCircle className="h-4 w-4 animate-spin" />
      ) : mode === "join" ? (
        <DoorOpen className="h-4 w-4" />
      ) : (
        <Sparkles className="h-4 w-4" />
      )}
      {t(getRoomEntrySubmitKey(mode, submitting))}
    </button>
  );
}

function JoinForm({
  values,
  errors,
  submitting,
  canAddMoreRooms,
  onFieldChange,
  onSubmit,
}: FormProps) {
  const t = useT();
  const roomCodeRef = useRef<HTMLInputElement | null>(null);
  const gateCodeRef = useRef<HTMLInputElement | null>(null);
  useFocusFirstError("join", errors, { roomCodeRef, gateCodeRef });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <form
      className="space-y-4"
      onSubmit={handleSubmit}
      noValidate
      aria-label={t("roomEntry.join.formLabel")}
      aria-busy={submitting || undefined}
    >
      <RoomCodeField
        value={values.joinRoomCode}
        error={errors.roomCode}
        inputRef={roomCodeRef}
        onChange={(value) => onFieldChange("joinRoomCode", value)}
      />
      <GateCodeField
        id="room-entry-join-gate-code"
        value={values.joinGateCode}
        error={errors.gateCode}
        label={t("roomEntry.join.gateCode.label")}
        placeholder={t("roomEntry.join.gateCode.placeholder")}
        hint={t("roomEntry.join.gateCode.hint", { length: GATE_CODE_LENGTH })}
        inputRef={gateCodeRef}
        onChange={(value) => onFieldChange("joinGateCode", value)}
      />
      <InviteTokenField
        value={values.joinInviteToken}
        onChange={(value) => onFieldChange("joinInviteToken", value)}
      />
      <SubmitButton mode="join" submitting={submitting} disabled={!canAddMoreRooms} />
    </form>
  );
}

function CreateForm({
  values,
  errors,
  submitting,
  canAddMoreRooms,
  onFieldChange,
  onSubmit,
}: FormProps) {
  const t = useT();
  const nameRef = useRef<HTMLInputElement | null>(null);
  const gateCodeRef = useRef<HTMLInputElement | null>(null);
  useFocusFirstError("create", errors, { nameRef, gateCodeRef });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <form
      className="space-y-4"
      onSubmit={handleSubmit}
      noValidate
      aria-label={t("roomEntry.create.formLabel")}
      aria-busy={submitting || undefined}
    >
      <CreateNameField
        value={values.createName}
        error={errors.name}
        inputRef={nameRef}
        onChange={(value) => onFieldChange("createName", value)}
      />
      <GateCodeField
        id="room-entry-create-gate-code"
        value={values.createGateCode}
        error={errors.gateCode}
        label={t("roomEntry.create.gateCode.label")}
        placeholder={t("roomEntry.create.gateCode.placeholder")}
        hint={t("roomEntry.create.gateCode.hint", { length: GATE_CODE_LENGTH })}
        inputRef={gateCodeRef}
        onChange={(value) => onFieldChange("createGateCode", value)}
      />
      <SubmitButton mode="create" submitting={submitting} disabled={!canAddMoreRooms} />
    </form>
  );
}

export type RoomEntryContentProps = {
  mode: RoomEntryMode;
  values: RoomEntryValues;
  errors: RoomEntryFieldErrors;
  submitting: boolean;
  canAddMoreRooms: boolean;
  maxRooms: number;
  onModeChange: (mode: RoomEntryMode) => void;
  onFieldChange: FieldChangeHandler;
  onCreate: () => void;
  onJoin: () => void;
};

/** Presentational dialog body, exported for static markup tests. */
export function RoomEntryContent({
  mode,
  values,
  errors,
  submitting,
  canAddMoreRooms,
  maxRooms,
  onModeChange,
  onFieldChange,
  onCreate,
  onJoin,
}: RoomEntryContentProps) {
  const t = useT();
  return (
    <div>
      <SegmentedControl
        value={mode}
        onChange={onModeChange}
        ariaLabel={t("roomEntry.tabs.label")}
        fullWidth
        className="mb-5"
        options={[
          {
            value: "join",
            label: t("roomEntry.tab.join"),
            icon: <DoorOpen className="h-4 w-4" />,
            disabled: submitting,
          },
          {
            value: "create",
            label: t("roomEntry.tab.create"),
            icon: <PlusCircle className="h-4 w-4" />,
            disabled: submitting,
          },
        ]}
      />
      {!canAddMoreRooms ? (
        <p
          role="status"
          className="mb-4 rounded-lg border border-warning-border bg-warning-soft px-3 py-2 text-xs leading-5 text-warning"
        >
          {t("roomEntry.limitReached", { max: maxRooms })}
        </p>
      ) : null}
      {mode === "join" ? (
        <JoinForm
          values={values}
          errors={errors}
          submitting={submitting}
          canAddMoreRooms={canAddMoreRooms}
          onFieldChange={onFieldChange}
          onSubmit={onJoin}
        />
      ) : (
        <CreateForm
          values={values}
          errors={errors}
          submitting={submitting}
          canAddMoreRooms={canAddMoreRooms}
          onFieldChange={onFieldChange}
          onSubmit={onCreate}
        />
      )}
    </div>
  );
}

export type RoomEntryDialogProps = {
  initialMode: RoomEntryMode;
  roomCount: number;
  maxRooms: number;
  canAddMoreRooms: boolean;
  onClose: () => void;
  onCreate: (values: RoomEntryCreateValues) => Promise<void>;
  onJoin: (values: RoomEntryJoinValues) => Promise<void>;
};

export function RoomEntryDialog({
  initialMode,
  roomCount,
  maxRooms,
  canAddMoreRooms,
  onClose,
  onCreate,
  onJoin,
}: RoomEntryDialogProps) {
  const t = useT();
  const [mode, setMode] = useState<RoomEntryMode>(initialMode);
  const [values, setValues] = useState<RoomEntryValues>(INITIAL_ROOM_ENTRY_VALUES);
  const [errors, setErrors] = useState<RoomEntryFieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  function handleModeChange(nextMode: RoomEntryMode) {
    setMode(nextMode);
    setErrors({});
  }

  function handleFieldChange(field: keyof RoomEntryValues, value: string) {
    setValues((previous) => ({
      ...previous,
      [field]: normalizeRoomEntryField(field, value),
    }));
    const errorField = getRoomEntryErrorField(field);
    if (errorField) {
      setErrors((previous) => clearRoomEntryFieldError(previous, errorField));
    }
  }

  async function handleCreate() {
    if (!canAddMoreRooms || submittingRef.current) return;
    const nextErrors = validateRoomEntryValues("create", values);
    setErrors(nextErrors);
    if (hasRoomEntryErrors(nextErrors)) return;

    submittingRef.current = true;
    setSubmitting(true);
    try {
      await onCreate({
        name: values.createName.trim(),
        gateCode: values.createGateCode,
      });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  async function handleJoin() {
    if (!canAddMoreRooms || submittingRef.current) return;
    const nextErrors = validateRoomEntryValues("join", values);
    setErrors(nextErrors);
    if (hasRoomEntryErrors(nextErrors)) return;

    submittingRef.current = true;
    setSubmitting(true);
    try {
      await onJoin({
        roomCode: values.joinRoomCode,
        gateCode: values.joinGateCode,
        inviteToken: values.joinInviteToken,
      });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  function handleClose() {
    if (submitting) return;
    onClose();
  }

  return (
    <Popover
      open
      onClose={handleClose}
      title={t("roomEntry.title")}
      description={t("roomEntry.subtitle", { count: roomCount, max: maxRooms })}
      closeLabel={t("common.close")}
      closeDisabled={submitting}
      size="lg"
    >
      <RoomEntryContent
        mode={mode}
        values={values}
        errors={errors}
        submitting={submitting}
        canAddMoreRooms={canAddMoreRooms}
        maxRooms={maxRooms}
        onModeChange={handleModeChange}
        onFieldChange={handleFieldChange}
        onCreate={handleCreate}
        onJoin={handleJoin}
      />
    </Popover>
  );
}
