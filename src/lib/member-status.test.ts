import { describe, expect, it } from "vitest";
import { ONLINE_WINDOW_MS } from "@/lib/constants";
import { describeLastActive, isMemberOnline } from "@/lib/member-status";

const NOW = new Date("2026-10-18T12:00:00.000Z").getTime();
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe("isMemberOnline", () => {
  it("无最近活跃时间时视为离线", () => {
    expect(isMemberOnline(null, NOW)).toBe(false);
  });

  it("无效时间字符串视为离线", () => {
    expect(isMemberOnline("not-a-date", NOW)).toBe(false);
  });

  it("在在线窗口内（含边界）视为在线", () => {
    expect(isMemberOnline(ago(ONLINE_WINDOW_MS), NOW)).toBe(true);
    expect(isMemberOnline(ago(30_000), NOW)).toBe(true);
  });

  it("超过在线窗口视为离线", () => {
    expect(isMemberOnline(ago(ONLINE_WINDOW_MS + 1), NOW)).toBe(false);
  });

  it("时钟漂移导致的未来时间按在线处理", () => {
    expect(isMemberOnline(new Date(NOW + 60_000).toISOString(), NOW)).toBe(true);
  });
});

describe("describeLastActive", () => {
  it("无记录或无效时间返回 never", () => {
    expect(describeLastActive(null, NOW)).toEqual({ kind: "never" });
    expect(describeLastActive("not-a-date", NOW)).toEqual({ kind: "never" });
  });

  it("一分钟内返回 justNow", () => {
    expect(describeLastActive(ago(30_000), NOW)).toEqual({ kind: "justNow" });
    expect(describeLastActive(new Date(NOW + 30_000).toISOString(), NOW)).toEqual({
      kind: "justNow",
    });
  });

  it("按分钟取整", () => {
    expect(describeLastActive(ago(5 * 60_000 + 59_000), NOW)).toEqual({
      kind: "minutes",
      count: 5,
    });
  });

  it("按小时取整", () => {
    expect(describeLastActive(ago(2 * 60 * 60_000 + 59 * 60_000), NOW)).toEqual({
      kind: "hours",
      count: 2,
    });
  });

  it("超过一天按天取整", () => {
    expect(describeLastActive(ago(3 * 24 * 60 * 60_000), NOW)).toEqual({
      kind: "days",
      count: 3,
    });
  });
});
