import type { Metadata } from "next";
import type { MessageKey } from "@/lib/i18n/messages";
import { APP_NAME } from "@/lib/constants";

/**
 * 站点级元信息（REQ-202610-0480 / ui-17）。
 *
 * 页面语言默认中文，Next.js 的静态 metadata 无法读取 localStorage 中的语言偏好，
 * 因此这里以站点主语言（中文）输出；英文界面文案仍由客户端 i18n 负责。
 */
export const SITE_TITLE = `${APP_NAME} · 匿名临时传输`;
export const SITE_DESCRIPTION = `${APP_NAME}是一个临时加密聊天室：房间短生命周期，文本与文件只在活跃期内短暂保留，阅后即散。`;

export const SITE_KEYWORDS = [
  "临时聊天室",
  "匿名传输",
  "阅后即散",
  "临时文件传输",
  "加密聊天",
] as const;

export const SITE_REPOSITORY_URL = "https://github.com/bendywork/bendy-shadowsend";
export const SITE_CHANGELOG_URL = `${SITE_REPOSITORY_URL}#readme`;
export const SITE_LICENSE_URL = `${SITE_REPOSITORY_URL}/blob/master/LICENSE`;

export type SiteFooterLink = {
  id: "repository" | "changelog" | "license";
  labelKey: MessageKey;
  href: string;
};

/** 页脚「项目」分组的入口，集中定义便于校验与复用。 */
export const SITE_FOOTER_PROJECT_LINKS: readonly SiteFooterLink[] = [
  {
    id: "repository",
    labelKey: "site.footer.repository",
    href: SITE_REPOSITORY_URL,
  },
  {
    id: "changelog",
    labelKey: "site.footer.changelog",
    href: SITE_CHANGELOG_URL,
  },
  {
    id: "license",
    labelKey: "site.footer.license",
    href: SITE_LICENSE_URL,
  },
];

export const siteMetadata: Metadata = {
  title: {
    default: SITE_TITLE,
    template: `%s · ${APP_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: APP_NAME,
  keywords: [...SITE_KEYWORDS],
  authors: [{ name: "Bendy" }],
  openGraph: {
    type: "website",
    siteName: APP_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    locale: "zh_CN",
    alternateLocale: ["en_US"],
  },
  twitter: {
    card: "summary",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
};
