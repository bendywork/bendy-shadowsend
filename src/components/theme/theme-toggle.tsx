"use client";

import { MoonStar, SunMedium } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";
import { IconButton } from "@/components/ui/icon-button";
import { Tooltip } from "@/components/ui/tooltip";
import { useT } from "@/lib/i18n/context";

const THEME_STORAGE_KEY = "tb:theme";

type ThemeMode = "dark" | "light";

// 主题偏好存于 localStorage，用 useSyncExternalStore 订阅：
// 首帧取服务端快照（dark，与 SSR 一致），挂载后切到客户端真实值，规避水合不匹配，
// 且不在 effect 内同步 setState（符合 react-hooks/set-state-in-effect）。
const listeners = new Set<() => void>();

function emitChange() {
  for (const l of listeners) l();
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
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return saved === "light" || saved === "dark" ? saved : "dark";
  } catch {
    return "dark";
  }
}

function getServerSnapshot(): ThemeMode {
  return "dark";
}

function setStoredTheme(mode: ThemeMode) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    /* 忽略 */
  }
  emitChange();
}

function applyTheme(mode: ThemeMode) {
  document.documentElement.setAttribute("data-theme", mode);
  window.dispatchEvent(new CustomEvent("tb-theme-change", { detail: mode }));
}

export function ThemeToggle({ className }: { className?: string }) {
  const t = useT();
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // 深色时显示“太阳”（点击切到浅色）；浅色时显示“月亮”。
  const label = theme === "dark" ? t("control.theme.toLight") : t("control.theme.toDark");

  return (
    <Tooltip label={label}>
      <IconButton
        aria-label={label}
        onClick={() => setStoredTheme(theme === "dark" ? "light" : "dark")}
        className={className}
      >
        {theme === "dark" ? <SunMedium className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
      </IconButton>
    </Tooltip>
  );
}
