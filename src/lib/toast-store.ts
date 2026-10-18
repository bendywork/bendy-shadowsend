export type ToastVariant = "success" | "error" | "warning" | "info";

export type ToastInput = {
  message: string;
  variant?: ToastVariant;
  title?: string;
  duration?: number;
  id?: string;
};

export type ToastRecord = {
  id: string;
  message: string;
  title?: string;
  variant: ToastVariant;
  duration: number;
  revision: number;
  createdAt: number;
};

/** Single source of truth for toast dwell time (REQ-202610-0469). */
export const TOAST_DURATIONS: Record<ToastVariant, number> = {
  success: 2400,
  info: 3000,
  warning: 3600,
  error: 4800,
};

export const TOAST_MAX_VISIBLE = 3;

export type ToastStore = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => readonly ToastRecord[];
  show: (input: ToastInput) => string;
  dismiss: (id: string) => void;
  clear: () => void;
};

type ToastStoreOptions = {
  now?: () => number;
  maxVisible?: number;
};

/**
 * Framework-free toast store. React binds to it through useSyncExternalStore,
 * while request helpers and event handlers can call the exported `toast`
 * singleton without needing a hook.
 */
export function createToastStore(options: ToastStoreOptions = {}): ToastStore {
  const now = options.now ?? Date.now;
  const maxVisible = Math.max(1, options.maxVisible ?? TOAST_MAX_VISIBLE);
  const listeners = new Set<() => void>();
  let items: readonly ToastRecord[] = [];
  let sequence = 0;

  function emit() {
    for (const listener of listeners) listener();
  }

  function show(input: ToastInput): string {
    const message = input.message.trim();
    if (!message) return "";

    const variant = input.variant ?? "info";
    const duration = input.duration ?? TOAST_DURATIONS[variant];
    const duplicate = items.find(
      (item) => item.variant === variant && item.message === message,
    );

    if (duplicate) {
      items = items.map((item) =>
        item.id === duplicate.id
          ? { ...item, duration, revision: item.revision + 1 }
          : item,
      );
      emit();
      return duplicate.id;
    }

    sequence += 1;
    const record: ToastRecord = {
      id: input.id ?? `toast-${sequence}`,
      message,
      ...(input.title ? { title: input.title } : {}),
      variant,
      duration,
      revision: 1,
      createdAt: now(),
    };

    items = [...items, record].slice(-maxVisible);
    emit();
    return record.id;
  }

  function dismiss(id: string) {
    const next = items.filter((item) => item.id !== id);
    if (next.length === items.length) return;
    items = next;
    emit();
  }

  function clear() {
    if (items.length === 0) return;
    items = [];
    emit();
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => items,
    show,
    dismiss,
    clear,
  };
}

export const toastStore = createToastStore();

type ToastOptions = Omit<ToastInput, "message" | "variant">;

/** Convenience façade for non-React call sites. */
export const toast = {
  show: (input: ToastInput) => toastStore.show(input),
  success: (message: string, options?: ToastOptions) =>
    toastStore.show({ ...options, message, variant: "success" }),
  error: (message: string, options?: ToastOptions) =>
    toastStore.show({ ...options, message, variant: "error" }),
  warning: (message: string, options?: ToastOptions) =>
    toastStore.show({ ...options, message, variant: "warning" }),
  info: (message: string, options?: ToastOptions) =>
    toastStore.show({ ...options, message, variant: "info" }),
  dismiss: (id: string) => toastStore.dismiss(id),
  clear: () => toastStore.clear(),
};
