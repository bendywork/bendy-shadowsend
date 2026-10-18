import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RemoteUploadError } from "@/lib/upload/remote/http";
import { uploadToSang } from "@/lib/upload/remote/sang";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("uploadToSang", () => {
  it("sends the documented headers and returns the remote URL", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        code: 200,
        msg: "success",
        data: "https://file.icve.com.cn/file_doc/abc",
      }),
    );

    const result = await uploadToSang({
      fileName: "报告 2026.pdf",
      mimeType: "application/pdf",
      body: new Uint8Array([1, 2, 3]),
      sizeBytes: 3,
      channel: "icve",
    });

    expect(result.url).toBe("https://file.icve.com.cn/file_doc/abc");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://file.sang.pub/api/upload");
    expect(init.method).toBe("POST");

    const headers = init.headers as Record<string, string>;
    expect(headers["X-Upload-Type"]).toBe("icve");
    expect(headers["X-File-Name"]).toBe(encodeURIComponent("报告 2026.pdf"));
    expect(headers["X-File-Size"]).toBe("3");
  });

  it("rejects an error payload with the remote message", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ code: 400, msg: "类型错误或缺失 X-Upload-Type" }, 400),
    );

    await expect(
      uploadToSang({
        fileName: "a.pdf",
        mimeType: "application/pdf",
        body: new Uint8Array([1]),
        sizeBytes: 1,
        channel: "icve",
      }),
    ).rejects.toThrowError(/类型错误或缺失/);
  });

  it("rejects untrusted response URLs", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ code: 200, msg: "success", data: "https://evil.example.com/x" }),
    );

    await expect(
      uploadToSang({
        fileName: "a.pdf",
        mimeType: "application/pdf",
        body: new Uint8Array([1]),
        sizeBytes: 1,
        channel: "icve",
      }),
    ).rejects.toBeInstanceOf(RemoteUploadError);
  });
});
