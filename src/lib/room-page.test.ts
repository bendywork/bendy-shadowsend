import { describe, expect, it } from "vitest";
import {
  MAX_MESSAGES_IN_MEMORY,
  computeRoomMenuPosition,
  formatRoomTime,
  getCollapsedPreviewText,
  getMessageDeliveryState,
  guessPreviewType,
  hasInlinePreview,
  isMessageCollapsed,
  mergeIncomingMessages,
  sortRooms,
  withStableAttachmentPreviewUrls,
} from "@/lib/room-page";
import type {
  MessageItem,
  RoomSnapshot,
  RoomTreeItem,
} from "@/types/chat";

const user = {
  id: "u1",
  nickname: "Alice",
  avatarInitial: "A",
  avatarColor: "#111111",
};

function makeMessage(id: string, createdAt = "2026-10-18T00:00:00.000Z"): MessageItem {
  return {
    id,
    roomId: "room-1",
    type: "TEXT",
    content: `message-${id}`,
    createdAt,
    sender: user,
    attachments: [],
  };
}

function makeSnapshot(overrides: Partial<RoomSnapshot> = {}): RoomSnapshot {
  return {
    app: { name: "Bendy", version: "0.1.69", openSource: "MIT" },
    room: {
      id: "room-1",
      roomCode: "ROOM1",
      name: "Room",
      ownerId: "u1",
      owner: user,
      hasGateCode: false,
      gateCodeExpiresAt: null,
      gateCode: null,
      neverExpire: false,
      allowJoinRequest: true,
    },
    announcement: {
      text: null,
      imageUrl: null,
      imageName: null,
      images: [],
      updatedAt: null,
      showToMe: false,
    },
    me: { ...user, role: "OWNER" as RoomSnapshot["me"]["role"] },
    members: [],
    pendingRequests: [],
    messages: [],
    stats: { roomOnline: 1, totalOnline: 1 },
    adBoard: { items: [], maxContentChars: 80 },
    ...overrides,
  };
}

function makeRoom(
  id: string,
  roomCode: string,
  createdAt: string,
): RoomTreeItem {
  return {
    id,
    roomCode,
    name: id,
    ownerId: "u1",
    hasGateCode: false,
    gateCodeExpiresAt: null,
    createdAt,
    role: "OWNER" as RoomTreeItem["role"],
  };
}

describe("attachment preview helpers", () => {
  it("guesses preview types from mime types", () => {
    expect(guessPreviewType("image/png")).toBe("IMAGE");
    expect(guessPreviewType("video/mp4")).toBe("VIDEO");
    expect(guessPreviewType("application/pdf")).toBe("NONE");
  });

  it("requires both a previewable type and a URL", () => {
    expect(
      hasInlinePreview({ previewType: "IMAGE", previewUrl: "blob:1" }),
    ).toBe(true);
    expect(hasInlinePreview({ previewType: "IMAGE", previewUrl: null })).toBe(
      false,
    );
    expect(
      hasInlinePreview({ previewType: "NONE", previewUrl: "blob:1" }),
    ).toBe(false);
  });
});

describe("withStableAttachmentPreviewUrls", () => {
  it("keeps a previously resolved preview URL when the refresh omits it", () => {
    const prev = makeSnapshot({
      messages: [
        {
          ...makeMessage("m1"),
          attachments: [
            {
              id: "a1",
              fileName: "a.png",
              mimeType: "image/png",
              sizeBytes: 1,
              storage: "S3",
              previewType: "IMAGE",
              previewUrl: "https://cdn/a1",
              createdAt: "2026-10-18T00:00:00.000Z",
            },
          ],
        },
      ],
    });
    const next = makeSnapshot({
      messages: [
        {
          ...makeMessage("m1"),
          attachments: [
            {
              id: "a1",
              fileName: "a.png",
              mimeType: "image/png",
              sizeBytes: 1,
              storage: "S3",
              previewType: "IMAGE",
              previewUrl: null,
              createdAt: "2026-10-18T00:00:00.000Z",
            },
          ],
        },
      ],
    });

    const merged = withStableAttachmentPreviewUrls(prev, next);

    expect(merged.messages[0].attachments[0].previewUrl).toBe(
      "https://cdn/a1",
    );
    expect(prev.messages[0].attachments[0].previewUrl).toBe(
      "https://cdn/a1",
    );
  });

  it("returns the next snapshot unchanged on first load", () => {
    const next = makeSnapshot();
    expect(withStableAttachmentPreviewUrls(null, next)).toBe(next);
  });
});

describe("mergeIncomingMessages", () => {
  it("appends only messages that are not already present", () => {
    const prev = makeSnapshot({ messages: [makeMessage("m1")] });
    const merged = mergeIncomingMessages(prev, [
      makeMessage("m1"),
      makeMessage("m2"),
    ]);

    expect(merged.messages.map((message) => message.id)).toEqual([
      "m1",
      "m2",
    ]);
  });

  it("returns the same snapshot when nothing new arrives", () => {
    const prev = makeSnapshot({ messages: [makeMessage("m1")] });
    expect(mergeIncomingMessages(prev, [makeMessage("m1")])).toBe(prev);
  });

  it("caps the in-memory message list", () => {
    const prev = makeSnapshot({
      messages: Array.from({ length: MAX_MESSAGES_IN_MEMORY - 1 }, (_, index) =>
        makeMessage(`m${index}`),
      ),
    });
    const merged = mergeIncomingMessages(prev, [
      makeMessage("new-1"),
      makeMessage("new-2"),
      makeMessage("new-3"),
    ]);

    expect(merged.messages).toHaveLength(MAX_MESSAGES_IN_MEMORY);
    expect(merged.messages.at(-1)?.id).toBe("new-3");
  });
});

describe("message collapse helpers", () => {
  it("collapses only long messages that are not expanded", () => {
    expect(isMessageCollapsed("short", false)).toBe(false);
    expect(isMessageCollapsed("x".repeat(1201), false)).toBe(true);
    expect(isMessageCollapsed("x".repeat(1201), true)).toBe(false);
  });

  it("keeps the collapsed preview within readable bounds", () => {
    const long = "x".repeat(5000);
    const preview = getCollapsedPreviewText(long);
    expect(preview.length).toBeGreaterThanOrEqual(360);
    expect(preview.length).toBeLessThanOrEqual(1600);
  });
});

describe("sortRooms", () => {
  it("sorts newest first and breaks ties by room code", () => {
    const sorted = sortRooms([
      makeRoom("b", "BBBB", "2026-10-18T00:00:00.000Z"),
      makeRoom("a", "AAAA", "2026-10-18T00:00:00.000Z"),
      makeRoom("new", "CCCC", "2026-10-19T00:00:00.000Z"),
    ]);

    expect(sorted.map((room) => room.id)).toEqual(["new", "a", "b"]);
  });
});

describe("getMessageDeliveryState", () => {
  const message = makeMessage("m1", "2026-10-18T00:00:00.000Z");

  it("marks a message as read when another member has seen it", () => {
    const snapshot = makeSnapshot({
      members: [
        {
          id: "member-1",
          userId: "u1",
          role: "OWNER" as RoomSnapshot["me"]["role"],
          status: "ACTIVE" as RoomSnapshot["members"][number]["status"],
          joinedAt: null,
          lastSeenAt: null,
          user,
        },
        {
          id: "member-2",
          userId: "u2",
          role: "MEMBER" as RoomSnapshot["me"]["role"],
          status: "ACTIVE" as RoomSnapshot["members"][number]["status"],
          joinedAt: null,
          lastSeenAt: "2026-10-18T00:01:00.000Z",
          user: { ...user, id: "u2", nickname: "Bob" },
        },
      ],
    });

    expect(getMessageDeliveryState(snapshot, message)).toBe("read");
  });

  it("marks a message as sent when nobody else has seen it", () => {
    expect(getMessageDeliveryState(makeSnapshot(), message)).toBe("sent");
  });

  it("returns null for messages from other members", () => {
    const snapshot = makeSnapshot();
    const otherMessage = {
      ...message,
      sender: { ...user, id: "u2" },
    };
    expect(getMessageDeliveryState(snapshot, otherMessage)).toBeNull();
  });
});

describe("computeRoomMenuPosition", () => {
  it("keeps the menu inside the viewport", () => {
    expect(
      computeRoomMenuPosition(
        { right: 5, top: 10, bottom: 30 },
        { width: 320, height: 200 },
      ),
    ).toEqual({ left: 8, top: 36 });
  });

  it("flips above the trigger when there is no room below", () => {
    expect(
      computeRoomMenuPosition(
        { right: 300, top: 150, bottom: 170 },
        { width: 320, height: 200 },
      ),
    ).toEqual({ left: 200, top: 108 });
  });
});

describe("formatRoomTime", () => {
  it("formats a timestamp with the room locale", () => {
    expect(formatRoomTime("2026-10-18T12:34:56.000Z")).toMatch(
      /\d{2}\/\d{2} \d{2}:\d{2}:\d{2}/,
    );
  });
});
