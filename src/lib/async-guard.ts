/**
 * 轻量同步锁：在异步动作开始前占位，结束后释放。
 *
 * React 的 setState 是异步的，双击时第二次事件可能在 loading 状态渲染前
 * 就到达；用 ref/Set 占位可以在事件入口处同步拒绝重复提交。
 */
export type AsyncGuard = {
  tryLock: (key: string) => boolean;
  unlock: (key: string) => void;
  isLocked: (key: string) => boolean;
};

export function createAsyncGuard(): AsyncGuard {
  const lockedKeys = new Set<string>();

  return {
    tryLock(key) {
      const normalized = key.trim();
      if (!normalized || lockedKeys.has(normalized)) return false;
      lockedKeys.add(normalized);
      return true;
    },
    unlock(key) {
      lockedKeys.delete(key.trim());
    },
    isLocked(key) {
      return lockedKeys.has(key.trim());
    },
  };
}
