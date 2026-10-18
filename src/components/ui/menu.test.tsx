import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MenuGroup, MenuItem, MenuSeparator, MenuSurface } from "./menu";

describe("menu primitives", () => {
  it("renders grouped regular and danger actions", () => {
    const html = renderToStaticMarkup(
      <MenuSurface ariaLabel="成员操作">
        <MenuGroup label="常规操作">
          <MenuItem icon={<span>C</span>} onSelect={() => undefined}>
            房主转让
          </MenuItem>
        </MenuGroup>
        <MenuSeparator />
        <MenuGroup label="危险操作">
          <MenuItem danger onSelect={() => undefined}>
            移除房间
          </MenuItem>
        </MenuGroup>
      </MenuSurface>,
    );

    expect(html).toContain('role="menu"');
    expect(html).toContain('aria-label="成员操作"');
    expect(html).toContain('role="group"');
    expect(html).toContain("常规操作");
    expect(html).toContain("危险操作");
    expect(html).toContain('role="separator"');
    expect(html.match(/role="menuitem"/g)).toHaveLength(2);
  });

  it("marks danger items with the danger class", () => {
    const html = renderToStaticMarkup(
      <MenuItem danger onSelect={() => undefined}>
        移除房间
      </MenuItem>,
    );

    expect(html).toContain("menu-item--danger");
  });

  it("keeps disabled items non-interactive", () => {
    const html = renderToStaticMarkup(
      <MenuItem disabled onSelect={() => undefined}>
        房主转让
      </MenuItem>,
    );

    expect(html).toContain("disabled");
  });
});
