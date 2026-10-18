"use client";

import { useEffect, useSyncExternalStore } from "react";

export const THEME_STORAGE_KEY = "tb:theme";

export type ThemeMode = "dark" | "light";

/** 将 localStorage 中的任意值收敛为受支持的主题，未知值回退深色。 */
export function normalizeTheme(value: string | null | undefined): ThemeMode {
  return value === "light" ? "light" : "dark";
}

const listeners = new Set<() => void>();

function emitChange() {
  for (const listener of listeners) listener();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

function getSnapshot(): ThemeMode {
  try {
    return normalizeTheme(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "dark";
  }
}

function getServerSnapshot(): ThemeMode {
  return "dark";
}

export function setStoredTheme(mode: ThemeMode) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    /* 忽略存储失败 */
  }
  emitChange();
}

function applyTheme(mode: ThemeMode) {
  document.documentElement.setAttribute("data-theme", mode);
  window.dispatchEvent(new CustomEvent("tb-theme-change", { detail: mode }));
}

/**
 * 主题偏好存于 localStorage，用 useSyncExternalStore 订阅：
 * 首帧取服务端快照（dark，与 SSR 一致），挂载后切到客户端真实值，
 * 规避水合不匹配，且不在 effect 内同步 setState。
 */
export function useTheme(): {
  theme: ThemeMode;
  setTheme: (mode: ThemeMode) => void;
} {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return { theme, setTheme: setStoredTheme };
}
