"use client";

import { useEffect, useState } from "react";
import { getLayoutMode, type LayoutMode } from "@/lib/responsive";

// Resolves the active layout mode from the viewport width. The server snapshot
// is "desktop" so markup stays deterministic; CSS already applies the correct
// grid before this hook runs, and the first client effect corrects the mode.
export function useLayoutMode(): LayoutMode {
  const [mode, setMode] = useState<LayoutMode>("desktop");

  useEffect(() => {
    let frame = 0;

    const update = () => {
      frame = 0;
      setMode(getLayoutMode(window.innerWidth));
    };
    const schedule = () => {
      if (frame === 0) frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);

    return () => {
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, []);

  return mode;
}
