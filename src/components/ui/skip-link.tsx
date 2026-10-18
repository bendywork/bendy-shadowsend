"use client";

import { useT } from "@/lib/i18n/context";

/**
 * 键盘用户跳过页头/侧栏直达主内容。仅在聚焦时可见，
 * 点击后把焦点显式移到 #main-content（目标带 tabIndex=-1）。
 */
export function SkipLink() {
  const t = useT();

  return (
    <a
      href="#main-content"
      className="skip-link"
      onClick={(event) => {
        const main = document.getElementById("main-content");
        if (!main) return;
        event.preventDefault();
        main.focus();
        main.scrollIntoView({ block: "start" });
      }}
    >
      {t("a11y.skipToContent")}
    </a>
  );
}
