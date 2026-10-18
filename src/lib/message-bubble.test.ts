import { describe, expect, it } from "vitest";
import {
  formatMessageTime,
  getMessageDeliveryState,
  getMessageGroupPositions,
  isSameMessageGroup,
  MESSAGE_GROUP_WINDOW_MS,
} from "@/lib/message-bubble";

const at = (minutesFromBase: number, base = Date.UTC(2026, 9, 18, 10, 0, 0)) =>
  new Date(base + minutesFromBase * 60_000).toISOString();

describe("isSameMessageGroup", () => {
  it("groups the same sender inside the window", () => {
    expect(
      isSameMessageGroup(
        { senderId: "u1", createdAt: at(0) },
        { senderId: "u1", createdAt: at(4) },
      ),
    ).toBe(true);
  });

  it("breaks the group when the window is exceeded", () => {
    expect(
      isSameMessageGroup(
        { senderId: "u1", createdAt: at(0) },
        { senderId: "u1", createdAt: at(MESSAGE_GROUP_WINDOW_MS / 60_000 + 1) },
      ),
    ).toBe(false);
  });

  it("never groups different senders", () => {
    expect(
      isSameMessageGroup(
        { senderId: "u1", createdAt: at(0) },
        { senderId: "u2", createdAt: at(1) },
      ),
    ).toBe(false);
  });

  it("treats invalid timestamps as group boundaries", () => {
    expect(
      isSameMessageGroup(
        { senderId: "u1", createdAt: "not-a-date" },
        { senderId: "u1", createdAt: at(1) },
      ),
    ).toBe(false);
  });
});

describe("getMessageGroupPositions", () => {
  it("returns an empty list for no messages", () => {
    expect(getMessageGroupPositions([])).toEqual([]);
  });

  it("marks isolated messages as single", () => {
    expect(
      getMessageGroupPositions([
        { senderId: "u1", createdAt: at(0) },
        { senderId: "u2", createdAt: at(1) },
        { senderId: "u1", createdAt: at(2) },
      ]),
    ).toEqual(["single", "single", "single"]);
  });

  it("marks first, middle and last inside a run", () => {
    expect(
      getMessageGroupPositions([
        { senderId: "u1", createdAt: at(0) },
        { senderId: "u1", createdAt: at(1) },
        { senderId: "u1", createdAt: at(2) },
        { senderId: "u2", createdAt: at(3) },
        { senderId: "u2", createdAt: at(4) },
      ]),
    ).toEqual(["first", "middle", "last", "first", "last"]);
  });

  it("splits a run when the time window lapses", () => {
    expect(
      getMessageGroupPositions([
        { senderId: "u1", createdAt: at(0) },
        { senderId: "u1", createdAt: at(6) },
        { senderId: "u1", createdAt: at(7) },
      ]),
    ).toEqual(["single", "first", "last"]);
  });
});

describe("getMessageDeliveryState", () => {
  const message = { senderId: "me", createdAt: at(10) };
  const members = [
    { userId: "me", lastSeenAt: at(20) },
    { userId: "other", lastSeenAt: at(15) },
  ];

  it("ignores messages from other people", () => {
    expect(
      getMessageDeliveryState(
        { senderId: "other", createdAt: at(10) },
        "me",
        members,
      ),
    ).toBeNull();
  });

  it("reports read once another member caught up", () => {
    expect(getMessageDeliveryState(message, "me", members)).toBe("read");
  });

  it("stays sent while nobody has seen the message", () => {
    expect(
      getMessageDeliveryState(message, "me", [
        { userId: "me", lastSeenAt: at(20) },
        { userId: "other", lastSeenAt: at(5) },
        { userId: "offline", lastSeenAt: null },
      ]),
    ).toBe("sent");
  });

  it("ignores invalid last-seen values", () => {
    expect(
      getMessageDeliveryState(message, "me", [
        { userId: "other", lastSeenAt: "garbage" },
      ]),
    ).toBe("sent");
  });
});

describe("formatMessageTime", () => {
  const now = new Date(2026, 9, 18, 20, 0, 0);
  const sameDay = new Date(2026, 9, 18, 14, 5, 0).toISOString();

  it("shows only the time for today", () => {
    expect(formatMessageTime(sameDay, "zh", now)).toMatch(/14:05/);
  });

  it("adds the date for older messages in the same year", () => {
    const older = new Date(2026, 9, 10, 9, 30, 0).toISOString();
    const formatted = formatMessageTime(older, "zh", now);
    expect(formatted).toMatch(/09:30/);
    expect(formatted).toMatch(/10/);
  });

  it("adds the year for messages from another year", () => {
    const older = new Date(2025, 0, 2, 8, 0, 0).toISOString();
    const formatted = formatMessageTime(older, "en", now);
    expect(formatted).toMatch(/2025/);
    expect(formatted).toMatch(/08:00/);
  });

  it("returns an empty string for invalid input", () => {
    expect(formatMessageTime("nope", "zh", now)).toBe("");
  });
});
