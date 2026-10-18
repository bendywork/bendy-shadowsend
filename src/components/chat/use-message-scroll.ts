"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  getAppendedMessages,
  isNearBottom,
  isNearTop,
  nextScrollTopForAnchor,
  resolveScrollBehavior,
  shouldAutoScrollToLatest,
} from "@/lib/message-scroll";
import type { MessageItem } from "@/types/chat";

type UseMessageScrollOptions = {
  conversationKey: string;
  messages: MessageItem[];
  pendingCount: number;
  selfId: string | null;
  hasMoreHistory: boolean;
  loadingOlder: boolean;
  onLoadOlder: () => void;
};

type ScrollAnchor = {
  id: string;
  top: number;
};

type UnreadState = {
  key: string;
  count: number;
  firstUnreadId: string | null;
};

type AwayState = {
  key: string;
  away: boolean;
};

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function findMessageNode(container: HTMLElement, id: string): HTMLElement | null {
  const nodes = container.querySelectorAll<HTMLElement>("[data-message-id]");
  for (const node of nodes) {
    if (node.dataset.messageId === id) return node;
  }
  return null;
}

function captureAnchor(container: HTMLElement): ScrollAnchor | null {
  const containerTop = container.getBoundingClientRect().top;
  const nodes = container.querySelectorAll<HTMLElement>("[data-message-id]");

  for (const node of nodes) {
    const rect = node.getBoundingClientRect();
    if (rect.bottom > containerTop + 1) {
      return { id: node.dataset.messageId ?? "", top: rect.top };
    }
  }

  return null;
}

function emptyUnread(key: string): UnreadState {
  return { key, count: 0, firstUnreadId: null };
}

export function useMessageScroll({
  conversationKey,
  messages,
  pendingCount,
  selfId,
  hasMoreHistory,
  loadingOlder,
  onLoadOlder,
}: UseMessageScrollOptions) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const anchorRef = useRef<ScrollAnchor | null>(null);
  const nearBottomRef = useRef(true);
  const initializedRef = useRef(false);
  const knownIdsRef = useRef<Set<string>>(new Set());
  const previousLatestIdRef = useRef<string | null>(null);
  const previousPendingCountRef = useRef(0);
  const firstUnreadIdRef = useRef<string | null>(null);
  const fillCheckRef = useRef<string>("");

  const [unreadState, setUnreadState] = useState<UnreadState>(() =>
    emptyUnread(conversationKey),
  );
  const [awayState, setAwayState] = useState<AwayState>(() => ({
    key: conversationKey,
    away: false,
  }));

  const newMessageCount =
    unreadState.key === conversationKey ? unreadState.count : 0;
  const firstUnreadId =
    unreadState.key === conversationKey ? unreadState.firstUnreadId : null;
  const isAwayFromBottom =
    awayState.key === conversationKey ? awayState.away : false;

  const clearUnread = useCallback(() => {
    setUnreadState((previous) =>
      previous.key === conversationKey &&
      previous.count === 0 &&
      previous.firstUnreadId === null
        ? previous
        : emptyUnread(conversationKey),
    );
  }, [conversationKey]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior) => {
    const container = scrollRef.current;
    if (!container) return;

    const resolved =
      behavior === "smooth" ? resolveScrollBehavior(prefersReducedMotion()) : behavior;
    container.scrollTo({ top: container.scrollHeight, behavior: resolved });
    nearBottomRef.current = true;
  }, []);

  const jumpToLatest = useCallback(() => {
    firstUnreadIdRef.current = null;
    setUnreadState(emptyUnread(conversationKey));
    scrollToBottom("smooth");
  }, [conversationKey, scrollToBottom]);

  const updateAnchor = useCallback((container: HTMLDivElement) => {
    anchorRef.current = captureAnchor(container);
  }, []);

  const restoreAnchor = useCallback((container: HTMLDivElement) => {
    const anchor = anchorRef.current;
    if (!anchor) return;

    const node = findMessageNode(container, anchor.id);
    if (!node) return;

    container.scrollTop = nextScrollTopForAnchor({
      scrollTop: container.scrollTop,
      anchorTop: anchor.top,
      currentTop: node.getBoundingClientRect().top,
    });
  }, []);

  const handleScroll = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;

    const metrics = {
      scrollTop: container.scrollTop,
      scrollHeight: container.scrollHeight,
      clientHeight: container.clientHeight,
    };
    const nearBottom = isNearBottom(metrics);
    nearBottomRef.current = nearBottom;
    setAwayState((previous) =>
      previous.key === conversationKey && previous.away === !nearBottom
        ? previous
        : { key: conversationKey, away: !nearBottom },
    );

    if (nearBottom) clearUnread();
    updateAnchor(container);

    if (isNearTop(metrics) && hasMoreHistory && !loadingOlder) {
      onLoadOlder();
    }
  }, [
    clearUnread,
    conversationKey,
    hasMoreHistory,
    loadingOlder,
    onLoadOlder,
    updateAnchor,
  ]);

  useLayoutEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const latest = messages.at(-1) ?? null;
    const latestChanged = latest?.id !== previousLatestIdRef.current;
    const pendingAdded = pendingCount > previousPendingCountRef.current;

    if (!initializedRef.current && messages.length > 0) {
      scrollToBottom("auto");
      initializedRef.current = true;
    } else if (initializedRef.current) {
      if (!nearBottomRef.current) restoreAnchor(container);

      if (
        shouldAutoScrollToLatest({
          pendingAdded,
          latestChanged,
          nearBottom: nearBottomRef.current,
        })
      ) {
        scrollToBottom("smooth");
        firstUnreadIdRef.current = null;
      } else if (latestChanged && latest) {
        const appended = getAppendedMessages(
          previousLatestIdRef.current,
          messages,
          knownIdsRef.current,
          selfId,
        );

        if (appended.length > 0) {
          setUnreadState((previous) => {
            const base =
              previous.key === conversationKey
                ? previous
                : emptyUnread(conversationKey);
            const nextFirstUnreadId =
              base.firstUnreadId ?? appended[0].id;
            if (nextFirstUnreadId === base.firstUnreadId) {
              firstUnreadIdRef.current = nextFirstUnreadId;
            }
            return {
              key: conversationKey,
              count: base.count + appended.length,
              firstUnreadId: nextFirstUnreadId,
            };
          });
          if (!firstUnreadIdRef.current) {
            firstUnreadIdRef.current = appended[0].id;
          }
        }
      }
    }

    knownIdsRef.current = new Set(messages.map((message) => message.id));
    previousLatestIdRef.current = latest?.id ?? null;
    previousPendingCountRef.current = pendingCount;
    updateAnchor(container);

    if (
      hasMoreHistory &&
      !loadingOlder &&
      container.scrollHeight <= container.clientHeight + 1
    ) {
      const signature = `${messages.length}:${pendingCount}:${hasMoreHistory}`;
      if (fillCheckRef.current !== signature) {
        fillCheckRef.current = signature;
        onLoadOlder();
      }
    }
  }, [
    conversationKey,
    messages,
    pendingCount,
    hasMoreHistory,
    loadingOlder,
    onLoadOlder,
    selfId,
    scrollToBottom,
    restoreAnchor,
    updateAnchor,
  ]);

  const hasContent = messages.length > 0 || pendingCount > 0;

  useEffect(() => {
    const container = scrollRef.current;
    const content = contentRef.current;
    if (!container || !content || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      if (nearBottomRef.current) {
        container.scrollTop = container.scrollHeight;
      } else {
        restoreAnchor(container);
      }
      updateAnchor(container);
    });

    observer.observe(content);
    return () => observer.disconnect();
  }, [hasContent, restoreAnchor, updateAnchor]);

  useEffect(() => {
    initializedRef.current = false;
    nearBottomRef.current = true;
    anchorRef.current = null;
    knownIdsRef.current = new Set();
    previousLatestIdRef.current = null;
    previousPendingCountRef.current = 0;
    firstUnreadIdRef.current = null;
    fillCheckRef.current = "";
  }, [conversationKey]);

  return {
    scrollRef,
    contentRef,
    newMessageCount,
    firstUnreadId,
    isAwayFromBottom,
    jumpToLatest,
    isNearBottomRef: nearBottomRef,
    handleScroll,
  };
}
