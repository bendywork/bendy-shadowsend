import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RoomSidebar, type RoomSidebarProps } from "@/components/chat/room-sidebar";
import type { RoomTreeItem } from "@/types/chat";

const ownerRoom: RoomTreeItem = {
  id: "room-owner",
  roomCode: "OWNER1",
  name: "我的房间",
  ownerId: "user-1",
  hasGateCode: true,
  gateCodeExpiresAt: null,
  createdAt: "2026-10-01T00:00:00.000Z",
  role: "OWNER",
};

const joinedRoom: RoomTreeItem = {
  id: "room-joined",
  roomCode: "JOIN01",
  name: "加入的房间",
  ownerId: "user-2",
  hasGateCode: false,
  gateCodeExpiresAt: null,
  createdAt: "2026-10-02T00:00:00.000Z",
  role: "MEMBER",
};

function makeProps(overrides: Partial<RoomSidebarProps> = {}): RoomSidebarProps {
  return {
    rooms: { created: [ownerRoom], joined: [joinedRoom] },
    activeCode: ownerRoom.roomCode,
    roomCount: 2,
    maxRooms: 5,
    canAddMoreRooms: true,
    submitting: false,
    createdCollapsed: false,
    joinedCollapsed: false,
    onToggleCreated: vi.fn(),
    onToggleJoined: vi.fn(),
    onCreate: vi.fn(),
    onJoin: vi.fn(),
    onLeaveRoom: vi.fn(),
    leavingRoomCode: null,
    onCopyError: vi.fn(),
    onToggleNav: vi.fn(),
    app: { version: "0.1.68", openSource: "MIT" },
    stats: { roomOnline: 3, totalOnline: 12 },
    me: { avatarInitial: "B", avatarColor: "#6b6b73", nickname: "笨迪" },
    ...overrides,
  };
}

describe("RoomSidebar", () => {
  it("renders both groups and marks only the active room", () => {
    render(<RoomSidebar {...makeProps()} />);

    expect(screen.getByRole("button", { name: /管理的房间/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /加入的房间/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /我的房间/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: /加入的房间/ })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("renders contextual empty states when a group has no rooms", () => {
    render(
      <RoomSidebar
        {...makeProps({ rooms: { created: [], joined: [] }, roomCount: 0 })}
      />,
    );

    expect(screen.getByText("还没有管理的房间")).toBeInTheDocument();
    expect(screen.getByText("还没有加入的房间")).toBeInTheDocument();
  });

  it("copies a room code from the hover quick action", async () => {
    const user = userEvent.setup();
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);
    render(<RoomSidebar {...makeProps()} />);

    const roomItem = screen.getByTestId("room-item-OWNER1");
    await user.click(within(roomItem).getByRole("button", { name: "复制房间号" }));

    expect(writeText).toHaveBeenCalledWith("OWNER1");
    expect(
      within(roomItem).getByRole("button", { name: "已复制" }),
    ).toBeInTheDocument();
  });

  it("reports copy failures instead of swallowing them", async () => {
    const onCopyError = vi.fn();
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(
      new Error("denied"),
    );
    render(<RoomSidebar {...makeProps({ onCopyError })} />);

    await user.click(
      within(screen.getByTestId("room-item-OWNER1")).getByRole("button", {
        name: "复制房间号",
      }),
    );

    expect(onCopyError).toHaveBeenCalledWith("复制失败，请检查浏览器权限");
  });

  it("opens the member room menu and leaves the room", async () => {
    const onLeaveRoom = vi.fn();
    const user = userEvent.setup();
    render(<RoomSidebar {...makeProps({ onLeaveRoom })} />);

    const joinedItem = screen.getByTestId("room-item-JOIN01");
    await user.click(
      within(joinedItem).getByRole("button", { name: "房间操作" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "退出房间" }));

    expect(onLeaveRoom).toHaveBeenCalledWith(joinedRoom);
  });

  it("does not offer a leave action for rooms the user owns", () => {
    render(
      <RoomSidebar
        {...makeProps({ rooms: { created: [ownerRoom], joined: [] } })}
      />,
    );

    expect(
      within(screen.getByTestId("room-item-OWNER1")).queryByRole("button", {
        name: "房间操作",
      }),
    ).not.toBeInTheDocument();
  });

  it("exposes collapse state and hides the group when collapsed", async () => {
    const onToggleCreated = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <RoomSidebar {...makeProps({ onToggleCreated })} />,
    );

    const toggle = screen.getByRole("button", { name: /管理的房间/ });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await user.click(toggle);
    expect(onToggleCreated).toHaveBeenCalledTimes(1);

    rerender(<RoomSidebar {...makeProps({ createdCollapsed: true })} />);
    expect(screen.queryByRole("link", { name: /我的房间/ })).not.toBeInTheDocument();
  });

  it("shows app, presence and current-user metadata in the footer", () => {
    render(<RoomSidebar {...makeProps()} />);

    expect(screen.getByText("0.1.68")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("笨迪")).toBeInTheDocument();
  });
});
