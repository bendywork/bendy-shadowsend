"use client";

import { useState } from "react";
import { CornerDownLeft, MoonStar, SlidersHorizontal, SunMedium } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { Popover } from "@/components/ui/popover";
import { Tooltip } from "@/components/ui/tooltip";
import { useLanguage, useT, type TFn } from "@/lib/i18n/context";
import { LANGS, type Lang } from "@/lib/i18n/messages";
import { ENTER_TO_SEND_STORAGE_KEY } from "@/lib/preferences";
import { useTheme, type ThemeMode } from "@/lib/theme";
import { usePersistentBoolean } from "@/lib/use-persistent-boolean";

type SettingsPanelContentProps = {
  lang: Lang;
  theme: ThemeMode;
  enterToSend: boolean;
  onLangChange: (lang: Lang) => void;
  onThemeChange: (theme: ThemeMode) => void;
  onEnterToSendChange: (value: boolean) => void;
  t: TFn;
};

const THEME_OPTIONS: Array<{
  value: ThemeMode;
  icon: typeof SunMedium;
  labelKey: "settings.panel.theme.light" | "settings.panel.theme.dark";
}> = [
  { value: "light", icon: SunMedium, labelKey: "settings.panel.theme.light" },
  { value: "dark", icon: MoonStar, labelKey: "settings.panel.theme.dark" },
];

/**
 * 纯展示层：主题 / 语言 / 偏好集中在同一面板。
 * 不依赖 DOM，可直接用 react-dom/server 做结构测试。
 */
export function SettingsPanelContent({
  lang,
  theme,
  enterToSend,
  onLangChange,
  onThemeChange,
  onEnterToSendChange,
  t,
}: SettingsPanelContentProps) {
  return (
    <div className="settings-panel">
      <section className="settings-section">
        <div className="settings-section__copy">
          <h4 className="settings-section__title">{t("settings.panel.appearance")}</h4>
          <p className="settings-section__hint">{t("settings.panel.appearance.hint")}</p>
        </div>
        <div
          className="segmented settings-options"
          role="group"
          aria-label={t("settings.panel.appearance")}
        >
          {THEME_OPTIONS.map(({ value, icon: Icon, labelKey }) => (
            <button
              key={value}
              type="button"
              className="segmented-item settings-option"
              data-active={theme === value}
              aria-pressed={theme === value}
              onClick={() => onThemeChange(value)}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {t(labelKey)}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section__copy">
          <h4 className="settings-section__title">{t("settings.panel.language")}</h4>
          <p className="settings-section__hint">{t("settings.panel.language.hint")}</p>
        </div>
        <div
          className="segmented settings-options"
          role="group"
          aria-label={t("settings.panel.language")}
        >
          {LANGS.map((value) => (
            <button
              key={value}
              type="button"
              className="segmented-item settings-option"
              data-active={lang === value}
              aria-pressed={lang === value}
              onClick={() => onLangChange(value)}
            >
              {t(value === "zh" ? "lang.name.zh" : "lang.name.en")}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <h4 className="settings-section__title">{t("settings.panel.preferences")}</h4>
        <div className="settings-preference">
          <div className="settings-preference__copy">
            <p className="settings-preference__label">
              <CornerDownLeft className="h-3.5 w-3.5" aria-hidden="true" />
              {t("settings.panel.enterToSend")}
            </p>
            <p className="settings-preference__hint">
              {t("settings.panel.enterToSend.hint")}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            className="settings-switch"
            aria-checked={enterToSend}
            aria-label={t("settings.panel.enterToSend")}
            data-on={enterToSend}
            onClick={() => onEnterToSendChange(!enterToSend)}
          >
            <span className="settings-switch__thumb" aria-hidden="true" />
          </button>
        </div>
      </section>

      <p className="settings-panel__note">{t("settings.panel.localOnly")}</p>
    </div>
  );
}

/** 顶栏设置入口：一个按钮收纳主题、语言与输入偏好。 */
export function SettingsButton({ className }: { className?: string }) {
  const t = useT();
  const { lang, setLang } = useLanguage();
  const { theme, setTheme } = useTheme();
  const [enterToSend, setEnterToSend] = usePersistentBoolean(
    ENTER_TO_SEND_STORAGE_KEY,
    true,
  );
  const [open, setOpen] = useState(false);

  return (
    <>
      <Tooltip label={t("settings.panel.open")}>
        <IconButton
          aria-label={t("settings.panel.open")}
          aria-haspopup="dialog"
          aria-expanded={open}
          active={open}
          onClick={() => setOpen(true)}
          className={className}
        >
          <SlidersHorizontal className="h-4 w-4" />
        </IconButton>
      </Tooltip>
      <Popover
        open={open}
        onClose={() => setOpen(false)}
        title={t("settings.panel.title")}
        closeLabel={t("common.close")}
        className="max-w-md"
      >
        <SettingsPanelContent
          lang={lang}
          theme={theme}
          enterToSend={enterToSend}
          onLangChange={setLang}
          onThemeChange={setTheme}
          onEnterToSendChange={setEnterToSend}
          t={t}
        />
      </Popover>
    </>
  );
}
