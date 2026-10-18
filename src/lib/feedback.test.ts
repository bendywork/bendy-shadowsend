import { afterEach, describe, expect, it } from "vitest";
import { ApiRequestError } from "@/lib/client";
import { isNetworkError, resolveErrorMessage, toastError } from "@/lib/feedback";
import { toastStore } from "@/lib/toast-store";
import type { MessageKey } from "@/lib/i18n/messages";

const translations: Partial<Record<MessageKey, string>> = {
  "toast.networkError": "网络异常，请检查网络后重试",
};

const t = (key: MessageKey) => translations[key] ?? key;

afterEach(() => {
  toastStore.clear();
});

describe("isNetworkError", () => {
  it("detects transport errors raised by apiFetch", () => {
    expect(isNetworkError(new ApiRequestError("网络请求失败: GET /api/x", { code: "NETWORK_ERROR" }))).toBe(true);
  });

  it("detects browser fetch failures", () => {
    expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);
  });

  it("does not treat business errors as network failures", () => {
    expect(isNetworkError(new ApiRequestError("房间不存在", { status: 404, code: "ROOM_NOT_FOUND" }))).toBe(false);
    expect(isNetworkError(new Error("门禁码错误"))).toBe(false);
  });
});

describe("resolveErrorMessage", () => {
  it("maps network failures to one readable message", () => {
    expect(
      resolveErrorMessage(new ApiRequestError("网络请求失败: POST /api/rooms", { code: "NETWORK_ERROR" }), "创建失败", t),
    ).toBe("网络异常，请检查网络后重试");
  });

  it("keeps user-readable backend business messages", () => {
    expect(
      resolveErrorMessage(new ApiRequestError("门禁码错误", { status: 403, code: "INVALID_GATE_CODE" }), "加入失败", t),
    ).toBe("门禁码错误");
  });

  it("hides internal server errors behind the caller fallback", () => {
    expect(
      resolveErrorMessage(new ApiRequestError("Prisma connection pool timeout", { status: 500 }), "保存失败", t),
    ).toBe("保存失败");
    expect(
      resolveErrorMessage(
        new ApiRequestError("Internal error", { status: 500, code: "INTERNAL_SERVER_ERROR" }),
        "保存失败",
        t,
      ),
    ).toBe("保存失败");
  });

  it("hides response parsing details", () => {
    expect(
      resolveErrorMessage(new ApiRequestError("解析响应失败: GET /api/x", { code: "INVALID_RESPONSE" }), "加载失败", t),
    ).toBe("加载失败");
  });

  it("replaces generic and empty messages with the fallback", () => {
    expect(resolveErrorMessage(new Error("请求失败"), "加载失败", t)).toBe("加载失败");
    expect(resolveErrorMessage(new Error(""), "加载失败", t)).toBe("加载失败");
    expect(resolveErrorMessage("boom", "加载失败", t)).toBe("加载失败");
  });
});

describe("toastError", () => {
  it("shows exactly one error toast and returns the resolved copy", () => {
    const message = toastError(new ApiRequestError("房间不存在", { status: 404 }), "加载失败", t);

    expect(message).toBe("房间不存在");
    expect(toastStore.getSnapshot()).toHaveLength(1);
    expect(toastStore.getSnapshot()[0]).toMatchObject({ variant: "error", message: "房间不存在" });
  });

  it("deduplicates repeated identical errors", () => {
    toastError(new ApiRequestError("房间不存在", { status: 404 }), "加载失败", t);
    toastError(new ApiRequestError("房间不存在", { status: 404 }), "加载失败", t);

    expect(toastStore.getSnapshot()).toHaveLength(1);
  });
});
