"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createAsyncGuard, type AsyncGuard } from "@/lib/async-guard";

export type GuardedRunResult<T> =
  | { started: false }
  | { started: true; value: T };

/**
 * 页面级异步动作守卫：同一 key 同时只执行一次，并把当前动作暴露给按钮
 * 的 loading/disabled 状态。action 名称与 ui-03 的按钮 loading 约定一致。
 */
export function useGuardedAction() {
  const guardRef = useRef<AsyncGuard | null>(null);
  const mountedRef = useRef(true);
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  if (guardRef.current === null) {
    guardRef.current = createAsyncGuard();
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const run = useCallback(
    async <T,>(key: string, task: () => Promise<T>): Promise<GuardedRunResult<T>> => {
      const guard = guardRef.current;
      if (!guard || !guard.tryLock(key)) {
        return { started: false };
      }

      if (mountedRef.current) {
        setPendingKey(key);
      }

      try {
        return { started: true, value: await task() };
      } finally {
        guard.unlock(key);
        if (mountedRef.current) {
          setPendingKey((current) => (current === key ? null : current));
        }
      }
    },
    [],
  );

  return { pendingKey, run };
}
