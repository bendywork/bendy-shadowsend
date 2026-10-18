import { describe, expect, it } from "vitest";
import {
  getAppendedMessages,
  getDistanceFromBottom,
  getOldestMessageAt,
  hasMoreHistoryAfterPage,
  isNearBottom,
  isNearTop,
  mergeMessagePages,
  nextScrollTopForAnchor,
  resolveScrollBehavior,
  shouldAutoScrollToLatest,
} from "@/lib/message-scroll";
import type { MessageItem } from "@/types/chat";

function message(
  id: string,
  createdAt: string,
  senderId = "user-1",
): MessageItem {
  return {
    id,
    roomId: "room-1",
    type: "TEXT",
    content: id,
    createdAt,
    sender: {
      id: senderId,
      nickname: senderId,
      avatarInitial: senderId.slice(0, 1).toUpperCase(),
      avatarColor: "#000000",
    },
    attachments: [],
  };
}

describe("scroll metrics", () => {
  it("computes the distance from the bottom and clamps short content to zero", () => {
    expect(
      getDistanceFromBottom({ scrollTop: 400, scrollHeight: 1000, clientHeight: 500 }),
    ).toBe(100);
    expect(
      getDistanceFromBottom({ scrollTop: 0, scrollHeight: 300, clientHeight: 500 }),
    ).toBe(0);
  });

  it("treats the viewport as near the bottom inside the threshold", () => {
    expect(
      isNearBottom({ scrollTop: 410, scrollHeight: 1000, clientHeight: 500 }),
    ).toBe(true);
    expect(
      isNearBottom({ scrollTop: 300, scrollHeight: 1000, clientHeight: 500 }),
    ).toBe(false);
  });

  it("detects the top edge for history loading", () => {
    expect(isNearTop({ scrollTop: 60, scrollHeight: 2000, clientHeight: 500 })).toBe(true);
    expect(isNearTop({ scrollTop: 400, scrollHeight: 2000, clientHeight: 500 })).toBe(false);
  });

  it("disables smooth scrolling when reduced motion is requested", () => {
    expect(resolveScrollBehavior(true)).toBe("auto");
    expect(resolveScrollBehavior(false)).toBe("smooth");
  });
});

describe("history pagination", () => {
  it("reads the oldest cursor from the first message", () => {
    const messages = [
      message("a", "2026-10-18T01:00:00.000Z"),
      message("b", "2026-10-18T01:01:00.000Z"),
    ];

    expect(getOldestMessageAt(messages)).toBe("2026-10-18T01:00:00.000Z");
    expect(getOldestMessageAt([])).toBeNull();
  });

  it("keeps paging until a short page arrives", () => {
    expect(hasMoreHistoryAfterPage(120, 120)).toBe(true);
    expect(hasMoreHistoryAfterPage(119, 120)).toBe(false);
    expect(hasMoreHistoryAfterPage(0, 120)).toBe(false);
  });

  it("merges pages by id, orders by time and replaces duplicated items", () => {
    const existing = [
      message("b", "2026-10-18T01:01:00.000Z"),
      message("c", "2026-10-18T01:02:00.000Z"),
    ];
    const incoming = [
      message("a", "2026-10-18T01:00:00.000Z"),
      message("b", "2026-10-18T01:01:00.000Z"),
    ];

    expect(mergeMessagePages(existing, incoming).map((item) => item.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("trims the oldest messages only when a max window is provided", () => {
    const existing = [
      message("a", "2026-10-18T01:00:00.000Z"),
      message("b", "2026-10-18T01:01:00.000Z"),
    ];
    const incoming = [
      message("c", "2026-10-18T01:02:00.000Z"),
      message("d", "2026-10-18T01:03:00.000Z"),
    ];

    expect(mergeMessagePages(existing, incoming, 3).map((item) => item.id)).toEqual([
      "b",
      "c",
      "d",
    ]);
    expect(mergeMessagePages(existing, incoming).map((item) => item.id)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });
});

describe("new message detection", () => {
  const known = new Set(["a", "b"]);

  it("returns only messages appended after the previous latest id", () => {
    const messages = [
      message("older", "2026-10-18T00:59:00.000Z", "user-2"),
      message("a", "2026-10-18T01:00:00.000Z"),
      message("b", "2026-10-18T01:01:00.000Z"),
      message("c", "2026-10-18T01:02:00.000Z", "user-2"),
      message("d", "2026-10-18T01:03:00.000Z", "me"),
    ];

    expect(
      getAppendedMessages("b", messages, known, "me").map((item) => item.id),
    ).toEqual(["c"]);
  });

  it("does not treat prepended history as new messages", () => {
    const messages = [
      message("older", "2026-10-18T00:59:00.000Z", "user-2"),
      message("a", "2026-10-18T01:00:00.000Z"),
      message("b", "2026-10-18T01:01:00.000Z"),
    ];

    expect(getAppendedMessages("b", messages, known, "me")).toEqual([]);
  });

  it("auto-scrolls for own pending messages even when the reader is away", () => {
    expect(
      shouldAutoScrollToLatest({ pendingAdded: true, latestChanged: false, nearBottom: false }),
    ).toBe(true);
    expect(
      shouldAutoScrollToLatest({ pendingAdded: false, latestChanged: true, nearBottom: false }),
    ).toBe(false);
    expect(
      shouldAutoScrollToLatest({ pendingAdded: false, latestChanged: true, nearBottom: true }),
    ).toBe(true);
  });
});

describe("scroll anchoring", () => {
  it("offsets scrollTop by the anchor movement", () => {
    expect(nextScrollTopForAnchor({ scrollTop: 500, anchorTop: 120, currentTop: 260 })).toBe(640);
    expect(nextScrollTopForAnchor({ scrollTop: 500, anchorTop: 120, currentTop: 120 })).toBe(500);
  });
});
