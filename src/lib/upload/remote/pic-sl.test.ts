import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RemoteUploadError } from "@/lib/upload/remote/http";
import {
  resetPicSlTokenCache,
  uploadToPicSl,
} from "@/lib/upload/remote/pic-sl";

const fetchMock = vi.fn();

beforeEach(() => {
  resetPicSlTokenCache();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "set-cookie": "__Host-imgsess=session-token; Path=/; Secure; HttpOnly",
    },
  });
}

const input = {
  fileName: "压缩包 2026.zip",
  mimeType: "application/zip",
  body: new Uint8Array([1, 2, 3]),
};

describe("uploadToPicSl", () => {
  it("exchanges a token and uploads with the same user agent and cookie", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ ok: true, token: "jwt-token", expires_in: 600 }))
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: { url: "https://pic.sl.al/f/pic/2026-10-18/fileid_1_name", file_id: 1 },
        }),
      );

    const result = await uploadToPicSl(input);
    expect(result.url).toBe("https://pic.sl.al/f/pic/2026-10-18/fileid_1_name");

    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0];
    expect(tokenUrl).toBe("https://pic.sl.al/api/upload-token");
    expect((tokenInit.headers as Record<string, string>).Referer).toBe(
      "https://pic.sl.al/",
    );

    const [uploadUrl, uploadInit] = fetchMock.mock.calls[1];
    expect(uploadUrl).toBe("https://pic.sl.al/api/upload");
    const uploadHeaders = uploadInit.headers as Record<string, string>;
    expect(uploadHeaders["X-Upload-Token"]).toBe("jwt-token");
    expect(uploadHeaders["X-Filename"]).toBe(encodeURIComponent(input.fileName));
    expect(uploadHeaders.Cookie).toBe("__Host-imgsess=session-token");
    expect(uploadHeaders["User-Agent"]).toBe(
      (tokenInit.headers as Record<string, string>)["User-Agent"],
    );
  });

  it("reuses the cached token for later chunks", async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        String(url).endsWith("/upload-token")
          ? jsonResponse({ ok: true, token: "jwt-token", expires_in: 600 })
          : jsonResponse({
              success: true,
              data: { url: "https://pic.sl.al/f/pic/2026-10-18/x" },
            }),
      ),
    );

    await uploadToPicSl(input);
    await uploadToPicSl(input);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/upload-token"))).toHaveLength(1);
  });

  it("fails clearly when the token endpoint rejects", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: false }, 403));

    await expect(uploadToPicSl(input)).rejects.toBeInstanceOf(RemoteUploadError);
  });

  it("fails clearly when the upload endpoint rejects", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ ok: true, token: "jwt-token", expires_in: 600 }))
      .mockResolvedValueOnce(jsonResponse({ success: false, message: "扩展名不允许" }, 400));

    await expect(uploadToPicSl(input)).rejects.toThrowError(/扩展名不允许/);
  });

  it("rejects untrusted response URLs", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ ok: true, token: "jwt-token", expires_in: 600 }))
      .mockResolvedValueOnce(
        jsonResponse({ success: true, data: { url: "https://evil.example.com/x" } }),
      );

    await expect(uploadToPicSl(input)).rejects.toBeInstanceOf(RemoteUploadError);
  });
});
