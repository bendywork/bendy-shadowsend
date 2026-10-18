import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MessageComposer } from "@/components/chat/message-composer";
import {
  applyUploadProgress,
  createUploadTask,
  markUploadDone,
  markUploadFailed,
  type UploadTask,
} from "@/lib/upload-queue";

const file = {
  size: 2 * 1024 * 1024,
  name: "demo.png",
  type: "image/png",
} as unknown as File;

const result = {
  s3Key: "rooms/demo/demo.png",
  fileName: "demo.png",
  mimeType: "image/png",
  sizeBytes: file.size,
  storage: "S3" as const,
  previewUrl: "https://example.com/demo.png",
};

function render(attachments: UploadTask[], text = "") {
  return renderToStaticMarkup(
    <MessageComposer
      text={text}
      maxTextLength={200000}
      attachments={attachments}
      enterToSend
      onTextChange={() => undefined}
      onAddFiles={() => undefined}
      onRemoveAttachment={() => undefined}
      onRetryAttachment={() => undefined}
      onRetryAllFailed={() => undefined}
      onToggleEnterToSend={() => undefined}
      onReadClipboard={() => undefined}
      onSubmit={() => undefined}
    />,
  );
}

describe("MessageComposer", () => {
  it("renders queued attachment chips and blocks submit while uploading", () => {
    const html = render([createUploadTask(file, "a")]);

    expect(html).toContain("demo.png");
    expect(html).toContain("等待上传");
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="0"');
    expect(html).toContain("上传中");
    expect(html).toMatch(/class="composer__send"[^>]*disabled/);
  });

  it("shows chunk progress for an uploading file", () => {
    const uploading = applyUploadProgress(createUploadTask(file, "a"), {
      percent: 40,
      chunkIndex: 1,
      chunkCount: 3,
    });
    const html = render([uploading]);

    expect(html).toContain("上传中 40% · 分片 2/3");
    expect(html).toContain('aria-valuenow="40"');
  });

  it("enables submit when every attachment is uploaded", () => {
    const done = markUploadDone(createUploadTask(file, "a"), result);
    const html = render([done], "hello");

    expect(html).toContain("已上传");
    const sendButton = html.match(/<button[^>]*class="composer__send"[^>]*>/)?.[0] ?? "";
    expect(sendButton).not.toContain("disabled");
  });

  it("offers retry for failed uploads", () => {
    const failed = markUploadFailed(
      createUploadTask(file, "a"),
      "网络错误，请重试",
    );
    const html = render([failed]);

    expect(html).toContain("网络错误，请重试");
    expect(html).toContain("1 个文件上传失败");
    expect(html).toContain("全部重试");
    expect(html).toContain('aria-label="重试 demo.png"');
    expect(html).toContain('aria-label="移除 demo.png"');
  });
});
