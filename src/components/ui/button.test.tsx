import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";

describe("Button", () => {
  it("renders a secondary md button by default", () => {
    render(<Button>保存</Button>);
    const button = screen.getByRole("button", { name: "保存" });

    expect(button).toHaveClass("btn", "btn--secondary", "btn--md");
    expect(button).toHaveAttribute("type", "button");
    expect(button).toBeEnabled();
  });

  it("applies variant, size and block classes", () => {
    render(
      <Button variant="primary" size="sm" block>
        创建
      </Button>,
    );
    const button = screen.getByRole("button", { name: "创建" });

    expect(button).toHaveClass("btn--primary", "btn--sm", "btn--block");
  });

  it("disables itself and announces busy while loading", () => {
    render(
      <Button loading icon={<span data-testid="icon" />}>
        提交
      </Button>,
    );
    const button = screen.getByRole("button", { name: "提交" });

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveAttribute("data-loading", "true");
    expect(button.querySelector(".btn__spinner")).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByTestId("icon")).not.toBeInTheDocument();
  });

  it("honours the disabled prop", () => {
    render(<Button disabled>删除</Button>);

    expect(screen.getByRole("button", { name: "删除" })).toBeDisabled();
  });

  it("forwards refs to the native button", () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Button ref={ref}>确认</Button>);

    expect(ref.current).toBe(screen.getByRole("button", { name: "确认" }));
  });
});

describe("IconButton", () => {
  it("applies size and state classes", () => {
    render(
      <IconButton size="sm" active danger aria-label="移除">
        <span aria-hidden="true">x</span>
      </IconButton>,
    );
    const button = screen.getByRole("button", { name: "移除" });

    expect(button).toHaveClass("icon-btn", "icon-btn--sm", "icon-btn--active", "icon-btn--danger");
  });

  it("swaps its glyph for a spinner while loading", () => {
    render(
      <IconButton loading aria-label="刷新">
        <span data-testid="glyph" />
      </IconButton>,
    );
    const button = screen.getByRole("button", { name: "刷新" });

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button.querySelector(".btn__spinner")).toBeInTheDocument();
    expect(screen.queryByTestId("glyph")).not.toBeInTheDocument();
  });
});
