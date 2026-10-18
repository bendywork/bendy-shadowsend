"use client";

import clsx from "clsx";
import { Check, Copy, X } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
} from "react";
import { copyTextToClipboard } from "@/lib/clipboard";
import {
  COPY_FEEDBACK_DURATION_MS,
  getCopyFeedbackMessageKey,
  type CopyFeedbackState,
} from "@/lib/copy-feedback";
import { useT } from "@/lib/i18n/context";
import { toast } from "@/lib/toast-store";

type Props = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "onClick" | "value"
> & {
  /** 要写入剪贴板的文本。 */
  value: string;
  /** 空闲态可见文案；图标按钮同时作为 aria-label。 */
  label: string;
  /** text = 常驻文案按钮（图标态）；icon = 纯图标按钮（图标态 + Toast）。 */
  variant?: "text" | "icon";
  /** 纯图标场景使用 Toast 补足可见性。 */
  toastOnSuccess?: boolean;
  /** 失败始终建议提示；密集列表可显式关闭。 */
  toastOnError?: boolean;
  successToastMessage?: string;
  iconClassName?: string;
  onCopied?: (ok: boolean) => void;
};

/**
 * 统一复制按钮（REQ-202610-0494 / ui-31）。
 *
 * 复制结果先落到按钮自身的图标态，1.6s 后复位；纯图标按钮额外通过 Toast
 * 确认成功，失败则始终走全局错误 Toast。所有复制入口共用同一套回退逻辑。
 */
export function CopyButton({
  value,
  label,
  variant = "text",
  toastOnSuccess = false,
  toastOnError = true,
  successToastMessage,
  iconClassName,
  className,
  disabled,
  onCopied,
  ...rest
}: Props) {
  const t = useT();
  const [state, setState] = useState<CopyFeedbackState>("idle");
  const [busy, setBusy] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  function scheduleReset() {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setState("idle");
      timerRef.current = null;
    }, COPY_FEEDBACK_DURATION_MS);
  }

  async function handleCopy() {
    if (busy || !value) return;
    setBusy(true);
    const ok = await copyTextToClipboard(value);
    setBusy(false);
    setState(ok ? "copied" : "failed");

    if (ok) {
      if (toastOnSuccess) {
        toast.success(successToastMessage ?? t("toast.copied"));
      }
    } else if (toastOnError) {
      toast.error(t("toast.copyFailed"));
    }

    onCopied?.(ok);
    scheduleReset();
  }

  const stateKey = getCopyFeedbackMessageKey(state);
  const visibleLabel = stateKey ? t(stateKey) : label;
  const Icon = state === "copied" ? Check : state === "failed" ? X : Copy;
  const iconOnly = variant === "icon";

  return (
    <button
      type="button"
      className={clsx(iconOnly ? "icon-btn" : "copy-button", className)}
      data-state={state}
      aria-label={iconOnly ? label : undefined}
      aria-busy={busy || undefined}
      disabled={disabled || busy}
      onClick={() => void handleCopy()}
      {...rest}
    >
      <Icon
        className={clsx("copy-button__icon", iconClassName)}
        aria-hidden="true"
      />
      {iconOnly ? (
        <span className="sr-only" aria-live="polite">
          {state === "idle" ? "" : visibleLabel}
        </span>
      ) : (
        <span aria-live="polite">{visibleLabel}</span>
      )}
    </button>
  );
}
