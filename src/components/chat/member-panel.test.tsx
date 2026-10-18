import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { MemberPanel } from "@/components/chat/member-panel";
import type { PendingRequestItem, RoomMemberItem } from "@/types/chat";

const NOW = new Date("2026-10-18T12:00:00.000Z").getTime();
const minutesAgo = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

const owner: RoomMemberItem = {
  id: "member-owner",
  userId: "user-owner",
  role: "OWNER",
  status: "ACTIVE",
  joinedAt: "2026-10-01T08:00:00.000Z",
  lastSeenAt: new Date(NOW - 20_000).toISOString(),
  user: {
    id: "user-owner",
    nickname: "房主小林",
    avatarInitial: "林",
    avatarColor: "#111111",
  },
};

const member: RoomMemberItem = {
  id: "member-2",
  userId: "user-2",
  role: "MEMBER",
  status: "ACTIVE",
  joinedAt: "2026-10-10T09:30:00.000Z",
  lastSeenAt: minutesAgo(125),
  user: {
    id: "user-2",
    nickname: "成员阿远",
    avatarInitial: "远",
    avatarColor: "#555555",
  },
};

const pendingRequest: PendingRequestItem = {
  id: "request-1",
  status: "PENDING",
  reason: "想加入讨论",
  createdAt: "2026-10-18T10:00:00.000Z",
  user: {
    id: "user-3",
    nickname: "待审批用户",
    avatarInitial: "审",
    avatarColor: "#888888",
  },
};

function renderPanel(overrides: Partial<ComponentProps<typeof MemberPanel>> = {}) {
  const props: ComponentProps<typeof MemberPanel> = {
    members: [owner, member],
    pendingRequests: [pendingRequest],
    isOwner: true,
    action: null,
    now: NOW,
    onCollapse: vi.fn(),
    onOpenSettings: vi.fn(),
    onKick: vi.fn(),
    onTransfer: vi.fn(),
    onReview: vi.fn(),
    ...overrides,
  };

  return { ...render(<MemberPanel {...props} />), props };
}

describe("MemberPanel", () => {
  it("渲染成员角色、在线状态与最近活跃时间", () => {
    renderPanel();

    expect(screen.getByText("2 人 · 1 在线")).toBeInTheDocument();
    expect(screen.getByText("房主小林")).toBeInTheDocument();
    expect(screen.getByText("成员阿远")).toBeInTheDocument();
    expect(screen.getByText("房主")).toBeInTheDocument();
    expect(screen.getAllByText("成员").length).toBeGreaterThan(0);
    expect(screen.getByText("在线")).toBeInTheDocument();
    expect(screen.getByText("离线")).toBeInTheDocument();
    expect(screen.getByText("最近活跃：2 小时前")).toBeInTheDocument();
  });

  it("无最近活跃记录时显示暂无记录", () => {
    renderPanel({
      members: [{ ...member, lastSeenAt: null }],
      pendingRequests: [],
    });

    expect(screen.getByText("最近活跃：暂无记录")).toBeInTheDocument();
  });

  it("房主可打开设置与收起成员栏", () => {
    const { props } = renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "房间设置" }));
    fireEvent.click(screen.getByRole("button", { name: "收起成员栏" }));

    expect(props.onOpenSettings).toHaveBeenCalledTimes(1);
    expect(props.onCollapse).toHaveBeenCalledTimes(1);
  });

  it("仅对非房主成员显示操作菜单，并可转让或移出", () => {
    const { props } = renderPanel();

    expect(screen.getAllByRole("button", { name: "成员操作" })).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "成员操作" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "房主转让" }));
    expect(props.onTransfer).toHaveBeenCalledWith(member);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "成员操作" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "移除房间" }));
    expect(props.onKick).toHaveBeenCalledWith(member);
  });

  it("非房主不显示审批 Tab、设置入口与成员操作", () => {
    renderPanel({ isOwner: false });

    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "房间设置" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "成员操作" })).not.toBeInTheDocument();
    expect(screen.getByText("成员阿远")).toBeInTheDocument();
  });

  it("切换到审批 Tab 后可批准或拒绝申请", () => {
    const { props } = renderPanel();

    fireEvent.click(screen.getByRole("tab", { name: /审批/ }));
    expect(screen.getByText("待审批用户")).toBeInTheDocument();
    expect(screen.getByText("想加入讨论")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "通过" }));
    expect(props.onReview).toHaveBeenCalledWith(pendingRequest, "approve");

    fireEvent.click(screen.getByRole("button", { name: "拒绝" }));
    expect(props.onReview).toHaveBeenCalledWith(pendingRequest, "reject");
  });

  it("审批列表为空时展示空状态", () => {
    renderPanel({ pendingRequests: [] });

    fireEvent.click(screen.getByRole("tab", { name: /审批/ }));
    expect(screen.getByText("暂无待审批")).toBeInTheDocument();
    expect(screen.getByText("新的加入申请会实时出现在这里。")).toBeInTheDocument();
  });

  it("审批处理中禁用操作按钮", () => {
    renderPanel({ action: "approve-request-1" });

    fireEvent.click(screen.getByRole("tab", { name: /审批/ }));
    const approve = screen.getByRole("button", { name: "通过" });
    const reject = screen.getByRole("button", { name: "拒绝" });

    expect(approve).toBeDisabled();
    expect(approve).toHaveAttribute("aria-busy", "true");
    expect(reject).toBeDisabled();
  });
});
