import { describe, expect, it } from "vitest";
import { messages } from "@/lib/i18n/messages";
import {
  SITE_DESCRIPTION,
  SITE_FOOTER_PROJECT_LINKS,
  SITE_REPOSITORY_URL,
  SITE_TITLE,
  siteMetadata,
} from "@/lib/site-meta";

describe("site metadata", () => {
  it("uses the localized site title and description", () => {
    expect(SITE_TITLE).toContain("临时笨迪");
    expect(SITE_TITLE).not.toContain("Temp Bendy");
    expect(SITE_DESCRIPTION).toContain("临时");
    expect(SITE_DESCRIPTION).not.toContain("Temporary encrypted chat app");
    expect(siteMetadata.description).toBe(SITE_DESCRIPTION);
  });

  it("exposes a title template bound to the site name", () => {
    expect(siteMetadata.title).toEqual({
      default: SITE_TITLE,
      template: "%s · 临时笨迪",
    });
    expect(siteMetadata.openGraph).toMatchObject({
      title: SITE_TITLE,
      description: SITE_DESCRIPTION,
      siteName: "临时笨迪",
      locale: "zh_CN",
    });
  });

  it("keeps footer entries absolute, unique and inside the repository", () => {
    const hrefs = SITE_FOOTER_PROJECT_LINKS.map((link) => link.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const href of hrefs) {
      expect(href.startsWith(SITE_REPOSITORY_URL)).toBe(true);
    }
  });

  it("has zh/en copy for every footer entry label", () => {
    for (const link of SITE_FOOTER_PROJECT_LINKS) {
      expect(messages.zh[link.labelKey]).toBeTruthy();
      expect(messages.en[link.labelKey]).toBeTruthy();
    }
  });
});
