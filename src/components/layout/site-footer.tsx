"use client";

import { ArrowUp, ArrowUpRight, DoorOpen, PlusCircle } from "lucide-react";
import { APP_OPEN_SOURCE, APP_VERSION } from "@/lib/constants";
import { useT } from "@/lib/i18n/context";
import { SITE_FOOTER_PROJECT_LINKS } from "@/lib/site-meta";

type SiteFooterProps = {
  onJoinRoom: () => void;
  onCreateRoom: () => void;
};

/**
 * 首页站点页脚（REQ-202610-0480 / ui-17）。
 * 入口按「使用 / 项目」两组收敛：房间动作直接切换首页表单，项目入口指向仓库真实页面。
 */
export function SiteFooter({ onJoinRoom, onCreateRoom }: SiteFooterProps) {
  const t = useT();
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="site-footer__brand">
          <p className="site-footer__wordmark">
            {t("site.footer.wordmark")}
            <span className="site-footer__wordmark-en">{t("site.footer.wordmarkEn")}</span>
          </p>
          <p className="site-footer__tagline">{t("site.footer.tagline")}</p>
        </div>

        <nav className="site-footer__nav" aria-label={t("site.footer.navLabel")}>
          <div className="site-footer__group">
            <p className="site-footer__group-title">{t("site.footer.group.product")}</p>
            <ul className="site-footer__list">
              <li>
                <button type="button" className="site-footer__link" onClick={onJoinRoom}>
                  <DoorOpen size={14} strokeWidth={1.75} aria-hidden="true" />
                  {t("site.footer.join")}
                </button>
              </li>
              <li>
                <button type="button" className="site-footer__link" onClick={onCreateRoom}>
                  <PlusCircle size={14} strokeWidth={1.75} aria-hidden="true" />
                  {t("site.footer.create")}
                </button>
              </li>
            </ul>
          </div>

          <div className="site-footer__group">
            <p className="site-footer__group-title">{t("site.footer.group.project")}</p>
            <ul className="site-footer__list">
              {SITE_FOOTER_PROJECT_LINKS.map((link) => (
                <li key={link.id}>
                  <a
                    className="site-footer__link"
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t(link.labelKey)}
                    <ArrowUpRight size={13} strokeWidth={1.75} aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </nav>
      </div>

      <div className="site-footer__meta">
        <p className="site-footer__meta-item">
          © <span className="tabular-nums">{year}</span> {t("site.footer.copyright")}
        </p>
        <p className="site-footer__meta-item">
          {t("site.footer.version")} <span className="tabular-nums">{APP_VERSION}</span>
        </p>
        <p className="site-footer__meta-item">
          {t("site.footer.license")} <span className="tabular-nums">{APP_OPEN_SOURCE}</span>
        </p>
        <button
          type="button"
          className="site-footer__top"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label={t("site.footer.backToTop")}
        >
          <ArrowUp size={13} strokeWidth={1.75} aria-hidden="true" />
          {t("site.footer.backToTop")}
        </button>
      </div>
    </footer>
  );
}
