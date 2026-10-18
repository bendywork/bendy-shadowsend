import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SettingsPanelContent } from "@/components/settings/settings-panel";
import { messages, type MessageKey } from "@/lib/i18n/messages";

function translate(key: MessageKey) {
  return messages.zh[key];
}

describe("SettingsPanelContent", () => {
  it("renders theme, language and preference controls", () => {
    const html = renderToStaticMarkup(
      <SettingsPanelContent
        lang="zh"
        theme="light"
        enterToSend={false}
        onLangChange={() => {}}
        onThemeChange={() => {}}
        onEnterToSendChange={() => {}}
        t={translate}
      />,
    );

    expect(html).toContain('aria-label="外观"');
    expect(html).toContain('aria-label="语言"');
    expect(html).toContain("浅色");
    expect(html).toContain("深色");
    expect(html).toContain("回车发送");
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="false"');
  });

  it("marks the active theme and language", () => {
    const html = renderToStaticMarkup(
      <SettingsPanelContent
        lang="en"
        theme="dark"
        enterToSend
        onLangChange={() => {}}
        onThemeChange={() => {}}
        onEnterToSendChange={() => {}}
        t={translate}
      />,
    );

    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain("English");
  });
});
