"use client";

import clsx from "clsx";
import { MoonStar, SunMedium } from "lucide-react";
import { useEffect, useState } from "react";

const THEME_STORAGE_KEY = "tb:theme";

type ThemeMode = "dark" | "light";

function applyTheme(mode: ThemeMode) {
  document.documentElement.setAttribute("data-theme", mode);
  window.dispatchEvent(new CustomEvent("tb-theme-change", { detail: mode }));
}

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "dark";
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return saved === "light" || saved === "dark" ? saved : "dark";
  });

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  function toggleTheme() {
    const nextTheme: ThemeMode = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  }

  return (
    <button
      type="button"
      aria-label="切换主题"
      onClick={toggleTheme}
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900/80 px-3 py-1.5 text-xs text-zinc-200 transition hover:bg-zinc-800",
        className,
      )}
    >
      {theme === "dark" ? (
        <SunMedium className="h-3.5 w-3.5" />
      ) : (
        <MoonStar className="h-3.5 w-3.5" />
      )}
      {theme === "dark" ? "日间" : "夜间"}
    </button>
  );
}
