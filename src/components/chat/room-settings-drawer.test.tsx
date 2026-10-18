import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  RoomSettingsContent,
  type RoomSettingsContentProps,
} from "./room-settings-drawer";

const room: RoomSettingsContentProps["room"] = {
  id: "room-1",
  roomCode: "ABCD1234",
  name: "深夜传输",
  ownerId: "user-1",
  owner: {
    id: "user-1",
    nickname: "房主",
    avatarInitial: "房",
    avatarColor: "#111111",
  },
  hasGateCode: true,
  gateCodeExpiresAt: null,
  gateCode: "123456",
  neverExpire: false,
  allowJoinRequest: true,
};

function makeProps(
  overrides: Partial<RoomSettingsContentProps> = {},
): RoomSettingsContentProps {
  return {
    room,
    memberCount: 3,
    roomOnline: 2,
    roomNameInput: room.name,
    gateCodeInput: room.gateCode ?? "",
    errors: {},
    action: null,
    onRoomNameChange: () => undefined,
    onGateCodeChange: () => undefined,
    onSaveRoomName: () => undefined,
    onSaveGateCode: () => undefined,
    onToggleJoinPolicy: () => undefined,
    onToggleNeverExpire: () => undefined,
    onDissolve: () => undefined,
    ...overrides,
  };
}

function render(overrides: Partial<RoomSettingsContentProps> = {}) {
  return renderToStaticMarkup(<RoomSettingsContent {...makeProps(overrides)} />);
}

describe("RoomSettingsContent", () => {
  it("renders all five sections in the agreed order", () => {
    const html = render();
    const headings = ["房间名称", "门禁码", "加入策略", "过期策略", "危险区"];
    const positions = headings.map((heading) => html.indexOf(heading));

    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("shows the room overview with member and online counts", () => {
    const html = render();

    expect(html).toContain("ABCD1234");
    expect(html).toContain("房主");
    expect(html).toContain("3 人 · 2 在线");
  });

  it("renders both switches with their current state", () => {
    const html = render();

    expect(html.match(/role="switch"/g)).toHaveLength(2);
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('aria-checked="false"');
  });

  it("disables saving when the name is unchanged", () => {
    const html = render();

    expect(html).toContain("保存");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>保存<\/button>/);
  });

  it("shows an inline error and marks the field invalid", () => {
    const html = render({
      roomNameInput: "",
      errors: { roomName: "房间名称不能为空" },
    });

    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain("房间名称不能为空");
    expect(html).toContain('role="alert"');
  });

  it("disables the clear action when no gate code is set", () => {
    const html = render({
      room: { ...room, gateCode: null, hasGateCode: false },
      gateCodeInput: "",
    });

    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>清除<\/button>/);
    expect(html).toContain("当前门禁码：未设置");
  });

  it("shows the saving state for the active action", () => {
    const html = render({ action: "gate-code" });

    expect(html).toContain("保存中…");
  });

  it("requires an inline confirmation before dissolving", () => {
    const html = render();

    expect(html).toContain("解散房间");
    expect(html).not.toContain("确认解散「深夜传输」？此操作不可撤销。");
    expect(html).not.toContain("确认解散</button>");
  });
});
