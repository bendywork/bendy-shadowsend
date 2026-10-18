"use client";

import clsx from "clsx";
import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { useT } from "@/lib/i18n/context";
import {
  toastStore,
  type ToastRecord,
  type ToastVariant,
} from "@/lib/toast-store";

const EMPTY_TOASTS: readonly ToastRecord[] = [];

const ICONS: Record<ToastVariant, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: TriangleAlert,
  info: Info,
};

/**
 * Mounts the global toast viewport. Kept inside LanguageProvider so the
 * dismiss label and future translated messages follow the active language.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <ToastViewport />
    </>
  );
}

function ToastViewport() {
  const toasts = useSyncExternalStore(
    toastStore.subscribe,
    toastStore.getSnapshot,
    () => EMPTY_TOASTS,
  );

  return (
    <div className="toast-viewport">
      {toasts.map((item) => (
        <ToastCard key={item.id} toast={item} />
      ))}
    </div>
  );
}

function ToastCard({ toast }: { toast: ToastRecord }) {
  const t = useT();
  const [paused, setPaused] = useState(false);
  const Icon = ICONS[toast.variant];
  const urgent = toast.variant === "error" || toast.variant === "warning";

  // Pausing on hover keeps long error messages readable without changing
  // the shared duration contract. Dedupe bumps `revision` to restart it.
  useEffect(() => {
    if (paused) return;
    const timer = window.setTimeout(
      () => toastStore.dismiss(toast.id),
      toast.duration,
    );
    return () => window.clearTimeout(timer);
  }, [paused, toast.duration, toast.id, toast.revision]);

  return (
    <div
      role={urgent ? "alert" : "status"}
      aria-live={urgent ? "assertive" : "polite"}
      aria-atomic="true"
      className={clsx("toast-card", `toast-card--${toast.variant}`)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <Icon className="toast-card__icon h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {toast.title ? <p className="toast-card__title">{toast.title}</p> : null}
        <p className="toast-card__message">{toast.message}</p>
      </div>
      <button
        type="button"
        className="toast-card__close"
        aria-label={t("toast.close")}
        onClick={() => toastStore.dismiss(toast.id)}
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
