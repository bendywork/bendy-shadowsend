import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CopyButton } from "@/components/ui/copy-button";

describe("CopyButton", () => {
  it("renders the inline variant with its idle label", () => {
    const html = renderToStaticMarkup(
      <CopyButton value="hello" label="复制文本" />,
    );

    expect(html).toContain("复制文本");
    expect(html).toContain('data-state="idle"');
    expect(html).toContain('type="button"');
  });

  it("renders the icon variant with a stable aria-label and live region", () => {
    const html = renderToStaticMarkup(
      <CopyButton value="https://example.com" label="邀请" variant="icon" />,
    );

    expect(html).toContain('aria-label="邀请"');
    expect(html).toContain("icon-btn");
    expect(html).toContain('aria-live="polite"');
  });
});
