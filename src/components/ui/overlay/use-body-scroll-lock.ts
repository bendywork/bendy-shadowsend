"use client";

import { useEffect } from "react";

let lockCount = 0;
let previousOverflow = "";
let previousPaddingRight = "";

// 多层弹层共用一个 body 锁：只由最外层打开时记录并恢复原始样式，
// 同时补偿滚动条宽度，避免桌面端打开弹层时页面横向跳动。
export function useBodyScrollLock(open: boolean) {
  useEffect(() => {
    if (!open) return;

    if (lockCount === 0) {
      previousOverflow = document.body.style.overflow;
      previousPaddingRight = document.body.style.paddingRight;

      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = "hidden";

      if (scrollbarWidth > 0) {
        const currentPadding =
          Number.parseFloat(window.getComputedStyle(document.body).paddingRight) || 0;
        document.body.style.paddingRight = `${currentPadding + scrollbarWidth}px`;
      }
    }

    lockCount += 1;

    return () => {
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount === 0) {
        document.body.style.overflow = previousOverflow;
        document.body.style.paddingRight = previousPaddingRight;
      }
    };
  }, [open]);
}
