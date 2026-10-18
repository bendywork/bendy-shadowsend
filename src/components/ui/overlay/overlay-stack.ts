"use client";

import { useEffect, useId, useLayoutEffect, useSyncExternalStore } from "react";

// 弹层层级管理器：后打开的弹层永远位于最上层，关闭后自动回落。
// 模块级栈只保存当前打开的弹层 id，不持有 DOM 引用。
export const OVERLAY_Z_BASE = 100;
export const OVERLAY_Z_STEP = 10;

let overlayStack: readonly string[] = [];
const listeners = new Set<() => void>();

function emitOverlayStackChange() {
  for (const listener of listeners) listener();
}

export function registerOverlay(id: string) {
  if (overlayStack.includes(id)) return;
  overlayStack = [...overlayStack, id];
  emitOverlayStackChange();
}

export function unregisterOverlay(id: string) {
  if (!overlayStack.includes(id)) return;
  overlayStack = overlayStack.filter((item) => item !== id);
  emitOverlayStackChange();
}

export function subscribeOverlayStack(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getOverlayStackSnapshot(): readonly string[] {
  return overlayStack;
}

const SERVER_OVERLAY_STACK: readonly string[] = [];

export function getOverlayStackServerSnapshot(): readonly string[] {
  return SERVER_OVERLAY_STACK;
}

// SSR 阶段没有 DOM，useLayoutEffect 会告警，因此服务端退回 useEffect。
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

export function useOverlayLayer(open: boolean) {
  const id = useId();

  useIsomorphicLayoutEffect(() => {
    if (!open) return;
    registerOverlay(id);
    return () => unregisterOverlay(id);
  }, [open, id]);

  const layers = useSyncExternalStore(
    subscribeOverlayStack,
    getOverlayStackSnapshot,
    getOverlayStackServerSnapshot,
  );
  const index = layers.indexOf(id);

  return {
    id,
    zIndex: index >= 0 ? OVERLAY_Z_BASE + index * OVERLAY_Z_STEP : OVERLAY_Z_BASE,
    isTop: index >= 0 && index === layers.length - 1,
  };
}
