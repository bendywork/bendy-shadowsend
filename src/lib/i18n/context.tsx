"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  DEFAULT_LANG,
  HTML_LANG,
  LANG_STORAGE_KEY,
  messages,
  type Lang,
  type MessageKey,
} from "./messages";

type TFn = (key: MessageKey, params?: Record<string, string | number>) => string;

type LanguageContextValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: TFn;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

function translate(
  lang: Lang,
  key: MessageKey,
  params?: Record<string, string | number>,
): string {
  const table = messages[lang] as Record<MessageKey, string>;
  const fallback = messages[DEFAULT_LANG] as Record<MessageKey, string>;
  let out = table?.[key] ?? fallback[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      out = out.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return out;
}

// 语言偏好存于 localStorage，用 useSyncExternalStore 订阅：
// 首帧取服务端快照（DEFAULT_LANG，与 <html lang="zh-CN"> 一致），挂载后切到用户真实偏好，
// 规避水合不匹配，且不在 effect 内同步 setState。
const listeners = new Set<() => void>();

function emitLangChange() {
  for (const l of listeners) l();
}

function subscribeLang(cb: () => void): () => void {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

function getLangSnapshot(): Lang {
  try {
    const stored = window.localStorage.getItem(LANG_STORAGE_KEY);
    return stored && stored in messages ? (stored as Lang) : DEFAULT_LANG;
  } catch {
    return DEFAULT_LANG;
  }
}

function getServerLangSnapshot(): Lang {
  return DEFAULT_LANG;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const lang = useSyncExternalStore(subscribeLang, getLangSnapshot, getServerLangSnapshot);

  useEffect(() => {
    document.documentElement.lang = HTML_LANG[lang];
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    try {
      window.localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {
      /* 忽略 */
    }
    emitLangChange();
  }, []);

  const value = useMemo<LanguageContextValue>(
    () => ({ lang, setLang, t: (key, params) => translate(lang, key, params) }),
    [lang, setLang],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    // Provider 未挂载时降级：默认语种、切换无副作用，避免整页崩溃。
    return {
      lang: DEFAULT_LANG,
      setLang: () => {},
      t: (key, params) => translate(DEFAULT_LANG, key, params),
    };
  }
  return ctx;
}

export function useT(): TFn {
  return useLanguage().t;
}
