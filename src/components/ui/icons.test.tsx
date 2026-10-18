import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  CheckIcon,
  ICON_SIZES,
  ICON_STROKE_WIDTH,
  LoaderCircleIcon,
  getIconStrokeWidth,
} from "./icons";

describe("icon wrapper", () => {
  it("renders the md default at 16px with a 1.75px optical stroke", () => {
    const html = renderToStaticMarkup(<CheckIcon />);

    expect(html.startsWith("<svg")).toBe(true);
    expect(html).toContain('width="16"');
    expect(html).toContain('height="16"');
    expect(html).toContain(`stroke-width="${getIconStrokeWidth("md")}"`);
    expect(html).toContain('aria-hidden="true"');
  });

  it("maps named sizes to the shared token scale", () => {
    const html = renderToStaticMarkup(
      <LoaderCircleIcon size="2xl" className="animate-spin" />,
    );

    expect(ICON_SIZES).toEqual({ xs: 12, sm: 14, md: 16, lg: 20, xl: 24, "2xl": 32 });
    expect(ICON_STROKE_WIDTH).toBe(1.75);
    expect(getIconStrokeWidth("md")).toBe(2.625);
    expect(getIconStrokeWidth("2xl")).toBe(1.3125);
    expect(html).toContain('width="32"');
    expect(html).toContain('height="32"');
    expect(html).toContain("animate-spin");
  });

  it("keeps decorative icons hidden and labels meaningful ones", () => {
    const decorative = renderToStaticMarkup(<CheckIcon />);
    const labelled = renderToStaticMarkup(<CheckIcon label="已完成" />);

    expect(decorative).toContain('aria-hidden="true"');
    expect(decorative).not.toContain("role=\"img\"");
    expect(labelled).toContain('role="img"');
    expect(labelled).toContain('aria-label="已完成"');
    expect(labelled).not.toContain('aria-hidden="true"');
  });
});
