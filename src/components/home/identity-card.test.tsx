import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { IdentityCard } from "./identity-card";
import type { ClientUser, RoomTreeItem } from "@/types/chat";

const me: ClientUser = {
  id: "user-1",
  nickname: "小笨",
  avatarInitial: "笨",
  avatarColor: "#4b4b52",
};

function makeRoom(overrides: Partial<RoomTreeItem> = {}): RoomTreeItem {
  return {
    id: "room-id",
    roomCode: "ROOMCODE01",
    name: "测试房间",
    ownerId: "user-1",
    hasGateCode: false,
    gateCodeExpiresAt: null,
    createdAt: "2026-10-18T01:00:00.000Z",
    role: "MEMBER",
    ...overrides,
  };
}

function renderCard(overrides: Partial<ComponentProps<typeof IdentityCard>> = {}) {
  const handlers = {
    onEnterRoom: vi.fn(),
    onJoin: vi.fn(),
    onCreate: vi.fn(),
  };

  render(
    <IdentityCard
      me={me}
      createdRooms={[]}
      joinedRooms={[]}
      roomsLoaded
      {...handlers}
      {...overrides}
    />,
  );

  return handlers;
}

describe("IdentityCard", () => {
  it("renders the avatar, nickname and room counts", () => {
    renderCard({
      createdRooms: [makeRoom({ id: "created-1", role: "OWNER" })],
      joinedRooms: [
        makeRoom({ id: "joined-1", roomCode: "ROOMCODE02" }),
        makeRoom({ id: "joined-2", roomCode: "ROOMCODE03" }),
      ],
    });

    expect(screen.getByText("小笨")).toBeInTheDocument();
    expect(screen.getByText("笨")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3/10")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "3");
  });

  it("opens the most recent room from the identity card", () => {
    const older = makeRoom({
      id: "older",
      roomCode: "OLDER0001",
      name: "旧房间",
      createdAt: "2026-10-17T01:00:00.000Z",
    });
    const newer = makeRoom({
      id: "newer",
      roomCode: "NEWER0001",
      name: "新房间",
      createdAt: "2026-10-18T02:00:00.000Z",
    });

    const { onEnterRoom } = renderCard({ joinedRooms: [older, newer] });

    expect(screen.getByText("新房间")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "进入房间 新房间" }));

    expect(onEnterRoom).toHaveBeenCalledTimes(1);
    expect(onEnterRoom).toHaveBeenCalledWith("NEWER0001");
  });

  it("shows the empty state and forwards join/create actions", () => {
    const { onJoin, onCreate } = renderCard();

    expect(screen.getByText("还没有房间。加入或创建一个，开始传递。")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "加入房间" }));
    fireEvent.click(screen.getByRole("button", { name: "创建房间" }));

    expect(onJoin).toHaveBeenCalledTimes(1);
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it("keeps counts as placeholders until room data is loaded", () => {
    renderCard({ roomsLoaded: false });

    expect(screen.getAllByText("—")).toHaveLength(3);
    expect(screen.getByText("正在载入房间信息…")).toBeInTheDocument();
  });
});
