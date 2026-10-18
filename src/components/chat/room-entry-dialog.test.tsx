import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  RoomEntryContent,
  type RoomEntryContentProps,
} from "@/components/chat/room-entry-dialog";
import {
  INITIAL_ROOM_ENTRY_VALUES,
  type RoomEntryValues,
} from "@/lib/room-entry";

const values: RoomEntryValues = {
  ...INITIAL_ROOM_ENTRY_VALUES,
  createName: "周末放映室",
  joinRoomCode: "8DK1A2M7QX",
};

function renderContent(overrides: Partial<RoomEntryContentProps> = {}) {
  return renderToStaticMarkup(
    <RoomEntryContent
      mode="join"
      values={values}
      errors={{}}
      submitting={false}
      canAddMoreRooms
      maxRooms={10}
      onModeChange={() => {}}
      onFieldChange={() => {}}
      onCreate={() => {}}
      onJoin={() => {}}
      {...overrides}
    />,
  );
}

describe("RoomEntryContent", () => {
  it("renders the join form with hints, counters and submit copy", () => {
    const html = renderContent();

    expect(html).toContain("房间号（URL 随机码）");
    expect(html).toContain("邀请 Token（可选）");
    expect(html).toContain("0/6");
    expect(html).toContain("进入房间");
    expect(html).toContain('aria-label="加入房间表单"');
    expect(html).toContain('aria-required="true"');
  });

  it("renders the create form with the name counter", () => {
    const html = renderContent({ mode: "create" });

    expect(html).toContain("房间名称");
    expect(html).toContain("5/48");
    expect(html).toContain("创建并进入");
    expect(html).toContain('aria-label="创建房间表单"');
  });

  it("wires inline errors to the invalid control", () => {
    const html = renderContent({
      errors: { roomCode: "form.roomCodeRequired" },
    });

    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('role="alert"');
    expect(html).toContain("请输入房间号");
    expect(html).toContain(
      'aria-describedby="room-entry-join-room-code-hint room-entry-join-room-code-error"',
    );
  });

  it("shows the localized limit in parameterized validation copy", () => {
    const html = renderContent({
      mode: "create",
      values: { ...values, createName: "x".repeat(49) },
      errors: { name: "form.roomNameTooLong" },
    });

    expect(html).toContain("房间名称不能超过 48 个字符");
    expect(html).toContain("49/48");
  });

  it("marks the active tab and disables submit while submitting", () => {
    const joinHtml = renderContent();
    expect(joinHtml).toContain('role="tab"');
    expect(joinHtml).toContain('aria-selected="true"');

    const createHtml = renderContent({ mode: "create", submitting: true });
    expect(createHtml).toContain("正在创建…");
    expect(createHtml).toMatch(/type="submit"[^>]*disabled/);
    expect(createHtml).toContain('aria-busy="true"');
  });

  it("explains when the room limit is reached", () => {
    const html = renderContent({ canAddMoreRooms: false });
    expect(html).toContain("已达到 10 个房间上限");
  });
});
