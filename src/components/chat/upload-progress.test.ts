import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  UploadProgress,
  type UploadProgressLabels,
} from "@/components/chat/upload-progress";

const labels: UploadProgressLabels = {
  queued: "等待上传",
  uploading: "上传中 {percent}%",
  retrying: "第 {attempt}/{max} 次尝试",
  done: "上传完成",
  failed: "上传失败",
  retry: "重试",
};

function render(element: Parameters<typeof renderToStaticMarkup>[0]): string {
  return renderToStaticMarkup(element);
}

describe("UploadProgress", () => {
  it("renders an accessible progress bar while uploading", () => {
    const html = render(
      createElement(UploadProgress, {
        state: {
          status: "uploading",
          progress: 42,
          attempt: 1,
          maxAttempts: 3,
        },
        labels,
      }),
    );

    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="42"');
    expect(html).toContain("上传中 42%");
  });

  it("shows the attempt counter while retrying", () => {
    const html = render(
      createElement(UploadProgress, {
        state: {
          status: "retrying",
          progress: 18,
          attempt: 2,
          maxAttempts: 3,
        },
        labels,
      }),
    );

    expect(html).toContain("第 2/3 次尝试");
    expect(html).toContain('aria-valuenow="18"');
  });

  it("shows the failure reason and retry action", () => {
    const html = render(
      createElement(UploadProgress, {
        state: {
          status: "failed",
          progress: 0,
          attempt: 3,
          maxAttempts: 3,
          error: "上游服务不可用",
        },
        labels,
        onRetry: () => undefined,
      }),
    );

    expect(html).toContain("上游服务不可用");
    expect(html).toContain("上传失败");
    expect(html).toContain("重试");
    expect(html).not.toContain('role="progressbar"');
  });

  it("does not render a retry action for completed uploads", () => {
    const html = render(
      createElement(UploadProgress, {
        state: {
          status: "done",
          progress: 100,
          attempt: 1,
          maxAttempts: 3,
        },
        labels,
        onRetry: () => undefined,
      }),
    );

    expect(html).toContain("上传完成");
    expect(html).not.toContain("重试");
  });
});
