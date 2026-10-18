import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EmptyState } from "./empty-state";

describe("EmptyState", () => {
  it("renders title, description and action", () => {
    render(
      <EmptyState
        variant="messages"
        title="还没有消息"
        description="发送第一条消息，开始这次临时会话。"
        action={<button type="button">发送第一条消息</button>}
      />,
    );

    expect(screen.getByText("还没有消息")).toBeInTheDocument();
    expect(screen.getByText("发送第一条消息，开始这次临时会话。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发送第一条消息" })).toBeInTheDocument();
  });

  it("invokes the action handler when pressed", () => {
    const onAction = vi.fn();
    render(
      <EmptyState
        title="暂无待审批"
        action={<button type="button" onClick={onAction}>刷新</button>}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "刷新" }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("exposes the illustration variant and compact mode", () => {
    const { container } = render(
      <EmptyState variant="rooms" title="暂无房间" compact />,
    );

    expect(container.querySelector('[data-empty-state="rooms"]')).toHaveAttribute(
      "data-compact",
      "true",
    );
    expect(container.querySelector('[data-illustration="rooms"]')).toBeInTheDocument();
  });

  it("does not render an action wrapper when no action is provided", () => {
    const { container } = render(<EmptyState variant="members" title="暂无成员" />);

    expect(container.querySelector('[data-empty-action]')).not.toBeInTheDocument();
  });
});
