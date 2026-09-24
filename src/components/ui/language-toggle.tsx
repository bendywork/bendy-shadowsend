"use client";

import { useLanguage } from "@/lib/i18n/context";
import { LANGS, type Lang } from "@/lib/i18n/messages";

// 语言切换：复用设计系统的 .segmented，直观显示当前语种、一键切换。
const SHORT: Record<Lang, string> = { zh: "中", en: "EN" };

export function LanguageToggle() {
  const { lang, setLang, t } = useLanguage();
  return (
    <div
      className="segmented inline-flex items-center gap-1 p-1"
      role="group"
      aria-label={t("control.language")}
    >
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          className="segmented-item px-2 py-1 text-xs font-medium"
          data-active={lang === l}
          aria-pressed={lang === l}
          onClick={() => setLang(l)}
        >
          {SHORT[l]}
        </button>
      ))}
    </div>
  );
}
