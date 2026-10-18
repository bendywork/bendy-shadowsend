import { describe, expect, it, vi } from "vitest";
import {
  TOAST_DURATIONS,
  TOAST_MAX_VISIBLE,
  createToastStore,
} from "./toast-store";

describe("toast store", () => {
  it("adds a toast with the info variant and its default duration", () => {
    const store = createToastStore();
    const id = store.show({ message: "已保存" });

    expect(id).toBeTruthy();
    expect(store.getSnapshot()).toHaveLength(1);
    expect(store.getSnapshot()[0]).toMatchObject({
      id,
      message: "已保存",
      variant: "info",
      duration: TOAST_DURATIONS.info,
    });
  });

  it("deduplicates identical variant and message by bumping revision", () => {
    const store = createToastStore();
    const first = store.show({ message: "网络异常", variant: "error" });
    const second = store.show({ message: "网络异常", variant: "error" });

    expect(second).toBe(first);
    expect(store.getSnapshot()).toHaveLength(1);
    expect(store.getSnapshot()[0].revision).toBe(2);
  });

  it("keeps the same message with different variants separate", () => {
    const store = createToastStore();
    store.show({ message: "已复制", variant: "success" });
    store.show({ message: "已复制", variant: "warning" });

    expect(store.getSnapshot()).toHaveLength(2);
  });

  it("drops the oldest toast once the visible limit is reached", () => {
    const store = createToastStore();

    for (let index = 1; index <= TOAST_MAX_VISIBLE + 1; index += 1) {
      store.show({ message: `toast-${index}` });
    }

    const messages = store.getSnapshot().map((item) => item.message);
    expect(messages).toHaveLength(TOAST_MAX_VISIBLE);
    expect(messages[0]).toBe("toast-2");
    expect(messages.at(-1)).toBe(`toast-${TOAST_MAX_VISIBLE + 1}`);
  });

  it("dismisses one toast by id and clears the rest", () => {
    const store = createToastStore();
    const first = store.show({ message: "one" });
    store.show({ message: "two" });

    store.dismiss(first);
    expect(store.getSnapshot().map((item) => item.message)).toEqual(["two"]);

    store.clear();
    expect(store.getSnapshot()).toEqual([]);
  });

  it("notifies subscribers until they unsubscribe", () => {
    const store = createToastStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.show({ message: "hello" });
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    store.show({ message: "world" });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("ignores blank messages", () => {
    const store = createToastStore();

    expect(store.show({ message: "   " })).toBe("");
    expect(store.getSnapshot()).toEqual([]);
  });

  it("accepts an explicit duration and id", () => {
    const store = createToastStore();

    store.show({ id: "custom", message: "sticky", duration: 9000 });

    expect(store.getSnapshot()[0]).toMatchObject({
      id: "custom",
      duration: 9000,
    });
  });
});
