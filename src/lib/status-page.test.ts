import { describe, expect, it } from "vitest";
import { ApiRequestError } from "@/lib/client";
import {
  classifyRoomLoadFailure,
  WAITING_APPROVAL_POLL_MS,
} from "@/lib/status-page";

describe("classifyRoomLoadFailure", () => {
  it("treats a 404 response as a missing room", () => {
    expect(
      classifyRoomLoadFailure(
        new ApiRequestError("房间不存在或已销毁", {
          status: 404,
          code: "ROOM_NOT_FOUND",
        }),
      ),
    ).toBe("not-found");
  });

  it("treats the ROOM_NOT_FOUND code as a missing room even without a status", () => {
    expect(
      classifyRoomLoadFailure(
        new ApiRequestError("房间不存在或已销毁", { code: "ROOM_NOT_FOUND" }),
      ),
    ).toBe("not-found");
  });

  it("keeps server failures on the generic error path", () => {
    expect(
      classifyRoomLoadFailure(
        new ApiRequestError("服务器内部错误", {
          status: 500,
          code: "INTERNAL_SERVER_ERROR",
        }),
      ),
    ).toBe("error");
  });

  it("keeps network failures on the generic error path", () => {
    expect(
      classifyRoomLoadFailure(
        new ApiRequestError("网络请求失败", { code: "NETWORK_ERROR" }),
      ),
    ).toBe("error");
  });

  it("falls back to the generic error path for unknown values", () => {
    expect(classifyRoomLoadFailure(new Error("boom"))).toBe("error");
    expect(classifyRoomLoadFailure(null)).toBe("error");
    expect(classifyRoomLoadFailure("404")).toBe("error");
  });
});

describe("WAITING_APPROVAL_POLL_MS", () => {
  it("checks the snapshot every five seconds", () => {
    expect(WAITING_APPROVAL_POLL_MS).toBe(5_000);
  });
});
