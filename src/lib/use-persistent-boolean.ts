"use client";

import { useCallback, useSyncExternalStore } from "react";

// 布尔偏好持久化到 localStorage：用 useSyncExternalStore 读取，
// 服务端快照固定为 serverDefault（与 SSR 一致，规避水合不匹配），挂载后切到本地真实值。
// 同标签用自定义事件同步，跨标签用 storage 事件同步。
export function usePersistentBoolean(
  key: string,
  serverDefault = false,
): [boolean, (v: boolean) => void, () => void] {
  const eventName = `pref:${key}`;

  const subscribe = useCallback(
    (cb: () => void) => {
      const onStorage = (e: StorageEvent) => {
        if (e.key === null || e.key === key) cb();
      };
      window.addEventListener("storage", onStorage);
      window.addEventListener(eventName, cb);
      return () => {
        window.removeEventListener("storage", onStorage);
        window.removeEventListener(eventName, cb);
      };
    },
    [key, eventName],
  );

  const getSnapshot = useCallback(() => {
    try {
      return window.localStorage.getItem(key) === "1";
    } catch {
      return serverDefault;
    }
  }, [key, serverDefault]);

  const getServerSnapshot = useCallback(() => serverDefault, [serverDefault]);

  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const set = useCallback(
    (v: boolean) => {
      try {
        window.localStorage.setItem(key, v ? "1" : "0");
      } catch {
        /* 忽略 */
      }
      window.dispatchEvent(new Event(eventName));
    },
    [key, eventName],
  );

  const toggle = useCallback(() => set(!value), [set, value]);

  return [value, set, toggle];
}
