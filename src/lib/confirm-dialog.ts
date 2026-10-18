import type { MessageKey } from "@/lib/i18n/messages";

/**
 * 危险操作确认的纯逻辑层：文案键与动作键集中在这里，
 * 页面只负责提供操作对象与执行动作，避免四处复制确认文案。
 */

export type DangerActionKind = "kick" | "transfer" | "leave" | "dissolve";

export type DangerConfirmCopy = {
  eyebrow: string;
  title: string;
  description: string;
  confirmLabel: string;
  pendingLabel: string;
  cancelLabel: string;
};

type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;

type CopyKeys = {
  title: MessageKey;
  description: MessageKey;
  confirm: MessageKey;
  pending: MessageKey;
};

const COPY_KEYS: Record<DangerActionKind, CopyKeys> = {
  kick: {
    title: "confirm.kick.title",
    description: "confirm.kick.description",
    confirm: "confirm.kick.action",
    pending: "confirm.kick.pending",
  },
  transfer: {
    title: "confirm.transfer.title",
    description: "confirm.transfer.description",
    confirm: "confirm.transfer.action",
    pending: "confirm.transfer.pending",
  },
  leave: {
    title: "confirm.leave.title",
    description: "confirm.leave.description",
    confirm: "confirm.leave.action",
    pending: "confirm.leave.pending",
  },
  dissolve: {
    title: "confirm.dissolve.title",
    description: "confirm.dissolve.description",
    confirm: "confirm.dissolve.action",
    pending: "confirm.dissolve.pending",
  },
};

export function getDangerConfirmCopy(
  kind: DangerActionKind,
  subjectName: string | null,
  t: Translate,
): DangerConfirmCopy {
  const keys = COPY_KEYS[kind];
  return {
    eyebrow: t("confirm.eyebrow"),
    title: t(keys.title),
    description: t(keys.description, subjectName ? { name: subjectName } : undefined),
    confirmLabel: t(keys.confirm),
    pendingLabel: t(keys.pending),
    cancelLabel: t("confirm.cancel"),
  };
}

/**
 * 与页面 `action` 状态保持同一命名，用于判断确认框是否处于提交中。
 * leave 以房间号、kick/transfer 以成员 id 作为目标标识。
 */
export function getDangerActionKey(
  kind: DangerActionKind,
  targetId?: string,
): string {
  if (kind === "dissolve") return "dissolve";
  return `${kind}-${targetId ?? ""}`;
}
