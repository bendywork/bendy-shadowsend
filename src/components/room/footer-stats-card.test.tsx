import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  FooterStatsCardContent,
  type FooterStatsLabels,
} from "@/components/room/footer-stats-card";
import type { RoomSnapshot } from "@/types/chat";

const labels: FooterStatsLabels = {
  overview: "房间概览",
  live: "实时",
  version: "版本",
  license: "开源协议",
  roomOnline: "房间在线",
  totalOnline: "全站在线",
  currentUser: "当前用户",
  owner: "房主",
  member: "成员",
};

const baseProps: {
  app: RoomSnapshot["app"];
  stats: RoomSnapshot["stats"];
  me: RoomSnapshot["me"];
  labels: FooterStatsLabels;
} = {
  app: { name: "临时笨迪", version: "0.1.69", openSource: "MIT" },
  stats: { roomOnline: 3, totalOnline: 42 },
  me: {
    id: "user-1",
    nickname: "小明",
    avatarInitial: "明",
    avatarColor: "#8e8e98",
    role: "OWNER",
  },
  labels,
};

function render(overrides: Partial<typeof baseProps> = {}) {
  return renderToStaticMarkup(
    <FooterStatsCardContent {...baseProps} {...overrides} />,
  );
}

describe("FooterStatsCardContent", () => {
  it("shows the overview heading, live state and both online metrics", () => {
    const html = render();

    expect(html).toContain("房间概览");
    expect(html).toContain("实时");
    expect(html).toContain("房间在线");
    expect(html).toContain("全站在线");
    expect(html).toContain(">3</dd>");
    expect(html).toContain(">42</dd>");
  });

  it("renders the current user, role, version and license", () => {
    const html = render();

    expect(html).toContain("当前用户");
    expect(html).toContain("小明");
    expect(html).toContain("房主");
    expect(html).toContain("版本");
    expect(html).toContain("0.1.69");
    expect(html).toContain("开源协议");
    expect(html).toContain("MIT");
  });

  it("uses a definition list and associates the section with its heading", () => {
    const html = render();
    const labelledBy = html.match(/aria-labelledby="([^"]+)"/)?.[1];

    expect(html).toContain("<dl");
    expect(labelledBy).toBeTruthy();
    expect(html).toContain(`id="${labelledBy}"`);
  });

  it("maps the member role to the member label", () => {
    const html = render({
      me: { ...baseProps.me, role: "MEMBER" as const },
    });

    expect(html).toContain("成员");
    expect(html).not.toContain("房主");
  });
});
