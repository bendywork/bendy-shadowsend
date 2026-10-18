import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
  document.body.style.paddingRight = "";
});

// jsdom 没有布局引擎，getClientRects 恒为空；焦点陷阱用它跳过不可见节点。
Object.defineProperty(HTMLElement.prototype, "getClientRects", {
  configurable: true,
  value: () => [{ width: 1, height: 1 }],
});
