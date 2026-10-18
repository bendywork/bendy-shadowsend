import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdCarouselContent } from "@/components/chat/ad-carousel";
import type { AdBoardItem } from "@/types/chat";

const ad = (content: string, extra: Partial<AdBoardItem> = {}): AdBoardItem => ({
  content,
  color: "",
  url: "",
  ...extra,
});

function render(items: AdBoardItem[], overrides: Partial<Parameters<typeof AdCarouselContent>[0]> = {}) {
  return renderToStaticMarkup(
    <AdCarouselContent
      items={items}
      index={0}
      animating={false}
      paused={false}
      label="Promoted"
      regionLabel="Promoted messages"
      pauseLabel="Pause rotation"
      resumeLabel="Resume rotation"
      onTogglePause={() => {}}
      {...overrides}
    />,
  );
}

describe("AdCarouselContent", () => {
  it("renders nothing when there are no ads", () => {
    expect(render([])).toBe("");
  });

  it("renders one quiet monochrome line and ignores per-ad colors", () => {
    const html = render([ad("Try the new uploader", { color: "#ff0000" })]);

    expect(html).toContain("Promoted");
    expect(html).toContain("Try the new uploader");
    expect(html).toContain('role="region"');
    expect(html).toContain('aria-roledescription="carousel"');
    expect(html).not.toContain("#ff0000");
    expect(html).not.toContain("style=");
  });

  it("keeps the pre-rendered next link out of the tab order", () => {
    const html = render([
      ad("first", { url: "https://example.com" }),
      ad("second", { url: "https://example.org" }),
    ]);

    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('tabindex="-1"');
  });

  it("exposes an explicit pause toggle with state", () => {
    const html = render([ad("first"), ad("second")]);
    expect(html).toContain('aria-label="Pause rotation"');
    expect(html).toContain('aria-pressed="false"');

    const pausedHtml = render([ad("first"), ad("second")], { paused: true });
    expect(pausedHtml).toContain('aria-label="Resume rotation"');
    expect(pausedHtml).toContain('aria-pressed="true"');
  });

  it("hides the toggle for a single ad", () => {
    const html = render([ad("only")]);
    expect(html).not.toContain("Pause rotation");
    expect(html).not.toContain("Resume rotation");
  });
});
