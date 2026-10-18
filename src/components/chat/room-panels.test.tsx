import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RoomMembersPanel } from "@/components/chat/room-members-panel";
import { RoomNavPanel } from "@/components/chat/room-nav-panel";
import type {
  PendingRequestItem,
  RoomMemberItem,
  RoomTreeItem,
} from "@/types/chat";

// next/image 依赖浏览器图片管线，jsdom 下无意义，直接替换为空节点。
vi.mock("next/image", () => ({ default: () => null }));

const noop = () => {};

function makeRoom(
  input: Pick<RoomTreeItem, "id" | "roomCode" | "name" | "role">,
): RoomTreeItem {
  return {
    ownerId: "u-owner",
    hasGateCode: false,
    gateCodeExpiresAt: null,
    createdAt: "2026-10-01T08:00:00.000Z",
    ...input,
  };
}

const createdRoom = makeRoom({
  id: "r-created",
  roomCode: "CREATED01",
  name: "我的房间",
  role: "OWNER",
});

const joinedRoom = makeRoom({
  id: "r-joined",
  roomCode: "JOINED01",
  name: "朋友的房间",
  role: "MEMBER",
});

const me = {
  id: "u-me",
  nickname: "我",
  avatarInitial: "我",
  avatarColor: "#888888",
};

const ownerMember: RoomMemberItem = {
  id: "m-owner",
  userId: "u-owner",
  role: "OWNER",
  status: "ACTIVE",
  joinedAt: "2026-10-01T08:00:00.000Z",
  lastSeenAt: null,
  user: {
    id: "u-owner",
    nickname: "房主",
    avatarInitial: "房",
    avatarColor: "#111111",
  },
};

const normalMember: RoomMemberItem = {
  id: "m-normal",
  userId: "u-normal",
  role: "MEMBER",
  status: "ACTIVE",
  joinedAt: "2026-10-02T08:00:00.000Z",
  lastSeenAt: null,
  user: {
    id: "u-normal",
    nickname: "成员甲",
    avatarInitial: "甲",
    avatarColor: "#222222",
  },
};

const pendingRequest: PendingRequestItem = {
  id: "req-1",
  reason: "想加入",
  createdAt: "2026-10-03T08:00:00.000Z",
  user: {
    id: "u-pending",
    nickname: "申请人",
    avatarInitial: "申",
    avatarColor: "#333333",
  },
};

function renderNav(
  overrides: Partial<Parameters<typeof RoomNavPanel>[0]> = {},
) {
  return render(
    <RoomNavPanel
      rooms={{ created: [createdRoom], joined: [joinedRoom] }}
      activeCode={createdRoom.roomCode}
      roomCount={2}
      maxRooms={5}
      canAddMoreRooms
      roomEntrySubmitting={false}
      createdCollapsed={false}
      joinedCollapsed={false}
      appVersion="0.1.68"
      openSource="MIT"
      stats={{ roomOnline: 3, totalOnline: 12 }}
      me={me}
      onToggleCreated={noop}
      onToggleJoined={noop}
      onOpenRoomEntry={noop}
      onToggleRoomMenu={noop}
      {...overrides}
    />,
  );
}

describe("RoomNavPanel", () => {
  it("renders both room groups and opens the create/join entry", () => {
    const onOpenRoomEntry = vi.fn();
    renderNav({ onOpenRoomEntry });

    expect(screen.getByText("管理的房间")).toBeInTheDocument();
    expect(screen.getByText("加入的房间")).toBeInTheDocument();
    expect(screen.getByText("我的房间")).toBeInTheDocument();
    expect(screen.getByText("朋友的房间")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "创建房间" }));
    fireEvent.click(screen.getByRole("button", { name: "加入房间" }));

    expect(onOpenRoomEntry).toHaveBeenNthCalledWith(1, "create");
    expect(onOpenRoomEntry).toHaveBeenNthCalledWith(2, "join");
  });

  it("closes the drawer after following a room link", () => {
    const onNavigate = vi.fn();
    renderNav({ onNavigate, showHeader: false });

    expect(screen.queryByText("加入 / 管理")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: /朋友的房间/ }));

    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it("only exposes the room actions menu for joined rooms", () => {
    const onToggleRoomMenu = vi.fn();
    renderNav({ onToggleRoomMenu });

    const triggers = screen.getAllByRole("button", { name: "房间操作" });
    expect(triggers).toHaveLength(1);

    fireEvent.click(triggers[0] as HTMLButtonElement);
    expect(onToggleRoomMenu).toHaveBeenCalledWith(
      joinedRoom,
      triggers[0],
    );
  });

  it("disables create/join when the room limit is reached", () => {
    renderNav({ canAddMoreRooms: false });

    expect(screen.getByRole("button", { name: "创建房间" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "加入房间" })).toBeDisabled();
  });
});

describe("RoomMembersPanel", () => {
  function renderMembers(
    overrides: Partial<Parameters<typeof RoomMembersPanel>[0]> = {},
  ) {
    return render(
      <RoomMembersPanel
        isOwner
        members={[ownerMember, normalMember]}
        pendingRequests={[pendingRequest]}
        tab="members"
        onTabChange={noop}
        openMemberMenuId={null}
        onToggleMemberMenu={noop}
        memberMenuRef={createRef<HTMLDivElement>()}
        action={null}
        onTransferOwner={noop}
        onKick={noop}
        onReview={noop}
        {...overrides}
      />,
    );
  }

  it("switches between members and approvals for the owner", () => {
    const onTabChange = vi.fn();
    renderMembers({ onTabChange });

    fireEvent.click(screen.getByRole("button", { name: "审批" }));
    expect(onTabChange).toHaveBeenCalledWith("approvals");
  });

  it("shows pending requests and reports approve/reject decisions", () => {
    const onReview = vi.fn();
    renderMembers({ tab: "approvals", onReview });

    expect(screen.getByText("申请人")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /通过/ }));
    fireEvent.click(screen.getByRole("button", { name: /拒绝/ }));

    expect(onReview).toHaveBeenNthCalledWith(1, pendingRequest, "approve");
    expect(onReview).toHaveBeenNthCalledWith(2, pendingRequest, "reject");
  });

  it("exposes transfer and kick actions for non-owner members", () => {
    const onTransferOwner = vi.fn();
    const onKick = vi.fn();
    renderMembers({
      openMemberMenuId: normalMember.id,
      onTransferOwner,
      onKick,
    });

    fireEvent.click(screen.getByRole("menuitem", { name: /房主转让/ }));
    expect(onTransferOwner).toHaveBeenCalledWith(normalMember);

    fireEvent.click(screen.getByRole("menuitem", { name: /移除房间/ }));
    expect(onKick).toHaveBeenCalledWith(normalMember);
  });

  it("hides owner-only tabs and member actions from regular members", () => {
    renderMembers({ isOwner: false });

    expect(
      screen.queryByRole("button", { name: "审批" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "成员操作" }),
    ).not.toBeInTheDocument();
  });

  it("renders the error message passed by the page", () => {
    renderMembers({ error: "操作失败" });
    expect(screen.getByText("操作失败")).toBeInTheDocument();
  });
});
