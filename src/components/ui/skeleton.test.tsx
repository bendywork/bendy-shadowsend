import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  HomeIdentitySkeleton,
  MemberListSkeleton,
  MessageListSkeleton,
  RoomListSkeleton,
  RoomPageSkeleton,
  Skeleton,
  SkeletonText,
} from "./skeleton";

describe("Skeleton primitives", () => {
  it("renders an aria-hidden block with requested dimensions", () => {
    const { container } = render(<Skeleton width={120} height={16} />);
    const block = container.querySelector("[data-skeleton]") as HTMLElement;

    expect(block).toBeInTheDocument();
    expect(block).toHaveAttribute("aria-hidden", "true");
    expect(block.style.width).toBe("120px");
    expect(block.style.height).toBe("16px");
  });

  it("renders the requested number of text lines with a shorter last line", () => {
    const { container } = render(<SkeletonText lines={3} />);
    const lines = container.querySelectorAll("[data-skeleton]");

    expect(lines).toHaveLength(3);
    expect((lines[2] as HTMLElement).style.width).toBe("62%");
  });
});

describe("Skeleton compositions", () => {
  it("renders room list rows inside a labelled status region", () => {
    const { container } = render(<RoomListSkeleton rows={2} />);

    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(container.querySelectorAll('[data-skeleton-row="room"]')).toHaveLength(2);
  });

  it("renders message flow rows inside a labelled status region", () => {
    const { container } = render(<MessageListSkeleton rows={4} />);

    expect(container.querySelector('[data-skeleton-region="messages"]')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-skeleton-row="message"]')).toHaveLength(4);
  });

  it("renders member rows inside a labelled status region", () => {
    const { container } = render(<MemberListSkeleton rows={3} />);

    expect(container.querySelector('[data-skeleton-region="members"]')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-skeleton-row="member"]')).toHaveLength(3);
  });

  it("composes all three skeleton regions into the room page shell", () => {
    const { container } = render(<RoomPageSkeleton />);

    expect(container.querySelector('[data-skeleton-page="room"]')).toBeInTheDocument();
    expect(container.querySelector('[data-skeleton-region="rooms"]')).toBeInTheDocument();
    expect(container.querySelector('[data-skeleton-region="messages"]')).toBeInTheDocument();
    expect(container.querySelector('[data-skeleton-region="members"]')).toBeInTheDocument();
  });

  it("renders a compact identity skeleton for the home page", () => {
    const { container } = render(<HomeIdentitySkeleton />);

    expect(container.querySelector('[data-skeleton-region="identity"]')).toBeInTheDocument();
    expect(container.querySelectorAll("[data-skeleton]").length).toBeGreaterThan(0);
  });
});
