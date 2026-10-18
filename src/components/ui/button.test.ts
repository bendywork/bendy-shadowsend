import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";

const leadingIcon = createElement("span", { "data-testid": "leading-icon" }, "icon");

describe("Button", () => {
  it("renders the shared base classes with default variant, size and type", () => {
    const html = renderToStaticMarkup(createElement(Button, null, "保存"));

    expect(html).toContain('type="button"');
    expect(html).toContain('class="btn btn--secondary btn--md"');
    expect(html).toContain("保存");
    expect(html).not.toContain("disabled");
  });

  it("maps variant, size and block props to modifier classes", () => {
    const html = renderToStaticMarkup(
      createElement(Button, { variant: "primary", size: "sm", block: true }, "进入"),
    );

    expect(html).toContain("btn--primary");
    expect(html).toContain("btn--sm");
    expect(html).toContain("btn--block");
  });

  it("disables itself and swaps the leading icon for a spinner while loading", () => {
    const html = renderToStaticMarkup(
      createElement(Button, { loading: true, icon: leadingIcon }, "保存"),
    );

    expect(html).toContain('disabled=""');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('data-loading="true"');
    expect(html).toContain("btn__spinner");
    expect(html).not.toContain('data-testid="leading-icon"');
  });

  it("keeps an explicit disabled state and forwards native button attributes", () => {
    const html = renderToStaticMarkup(
      createElement(Button, { disabled: true, "aria-label": "保存设置" }, "保存"),
    );

    expect(html).toContain('disabled=""');
    expect(html).toContain('aria-label="保存设置"');
  });
});

describe("IconButton", () => {
  it("renders children normally when idle", () => {
    const html = renderToStaticMarkup(createElement(IconButton, null, leadingIcon));

    expect(html).toContain('class="icon-btn"');
    expect(html).toContain('data-testid="leading-icon"');
    expect(html).not.toContain("btn__spinner");
  });

  it("replaces children with a spinner and disables while loading", () => {
    const html = renderToStaticMarkup(
      createElement(IconButton, { loading: true, danger: true }, leadingIcon),
    );

    expect(html).toContain('disabled=""');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('data-loading="true"');
    expect(html).toContain("icon-btn--danger");
    expect(html).toContain("btn__spinner");
    expect(html).not.toContain('data-testid="leading-icon"');
  });

  it("supports the shared sm/md size modifiers", () => {
    const html = renderToStaticMarkup(createElement(IconButton, { size: "sm" }, leadingIcon));

    expect(html).toContain("icon-btn--sm");
  });
});
