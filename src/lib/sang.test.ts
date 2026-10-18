import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import {
  buildSangHeaders,
  parseSangResponse,
  uploadToSang,
} from "@/lib/sang";

const noSleep = async () => {};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("buildSangHeaders", () => {
  it("encodes the file name and forwards channel and size", () => {
    const headers = buildSangHeaders({
      channel: "meitu",
      fileName: "照片 1.png",
      sizeBytes: 2048,
    });

    expect(headers["X-Upload-Type"]).toBe("meitu");
    expect(headers["X-File-Name"]).toBe(encodeURIComponent("照片 1.png"));
    expect(headers["X-File-Size"]).toBe("2048");
    expect(headers["Content-Type"]).toBe("application/octet-stream");
  });
});

describe("parseSangResponse", () => {
  it("parses a successful response", () => {
    expect(
      parseSangResponse(
        JSON.stringify({
          code: 200,
          msg: "success",
          data: "https://xiuxiu-pro-new.meitudata.com/posters/a.png",
        }),
      ),
    ).toEqual({
      ok: true,
      url: "https://xiuxiu-pro-new.meitudata.com/posters/a.png",
    });
  });

  it("marks transient parse failures as retryable", () => {
    expect(parseSangResponse("<html>bad gateway</html>")).toEqual({
      ok: false,
      retryable: true,
      message: "file.sang.pub 返回了无法解析的响应",
    });
  });

  it("marks upstream 4xx responses as non-retryable", () => {
    const parsed = parseSangResponse(
      JSON.stringify({ code: 400, msg: "unsupported file type" }),
    );

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.retryable).toBe(false);
      expect(parsed.message).toContain("unsupported file type");
    }
  });

  it("rejects a non-URL data field", () => {
    const parsed = parseSangResponse(
      JSON.stringify({ code: 200, msg: "success", data: "javascript:alert(1)" }),
    );

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.retryable).toBe(false);
    }
  });
});

describe("uploadToSang", () => {
  const baseParams = {
    fileName: "photo.png",
    mimeType: "image/png",
    body: new Uint8Array([1, 2, 3, 4]),
  };

  it("posts raw bytes with protocol headers and returns the remote URL", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        code: 200,
        msg: "success",
        data: "https://xiuxiu-pro-new.meitudata.com/photo.png",
      }),
    );

    const result = await uploadToSang(baseParams, {
      endpoint: "https://file.sang.pub/api/upload",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep: noSleep,
    });

    expect(result).toEqual({
      url: "https://xiuxiu-pro-new.meitudata.com/photo.png",
      channel: "meitu",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const [, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["X-Upload-Type"]).toBe(
      "meitu",
    );
    expect(init.body).toBeInstanceOf(Buffer);
  });

  it("retries retryable statuses within the same service", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ code: 503, msg: "busy" }, 503))
      .mockResolvedValueOnce(jsonResponse({ code: 200, msg: "success", data: "https://xiuxiu-pro-new.meitudata.com/ok.png" }));

    const result = await uploadToSang(baseParams, {
      endpoint: "https://file.sang.pub/api/upload",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleep: noSleep,
    });

    expect(result.url).toBe("https://xiuxiu-pro-new.meitudata.com/ok.png");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-retryable HTTP errors", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ code: 400, msg: "bad request" }, 400),
    );

    await expect(
      uploadToSang(baseParams, {
        endpoint: "https://file.sang.pub/api/upload",
        fetchImpl: fetchImpl as unknown as typeof fetch,
        sleep: noSleep,
      }),
    ).rejects.toMatchObject({
      status: 502,
      code: "SANG_UPLOAD_FAILED",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries invalid JSON and then fails with a clear error", async () => {
    const fetchImpl = vi.fn(async () => new Response("not-json", { status: 200 }));

    await expect(
      uploadToSang(baseParams, {
        endpoint: "https://file.sang.pub/api/upload",
        fetchImpl: fetchImpl as unknown as typeof fetch,
        maxAttempts: 2,
        sleep: noSleep,
      }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("rejects unsupported channel inputs without calling the upstream", async () => {
    const fetchImpl = vi.fn();

    await expect(
      uploadToSang(
        {
          fileName: "page.html",
          mimeType: "text/html",
          body: new Uint8Array([1]),
        },
        {
          endpoint: "https://file.sang.pub/api/upload",
          fetchImpl: fetchImpl as unknown as typeof fetch,
          sleep: noSleep,
        },
      ),
    ).rejects.toMatchObject({
      status: 400,
      code: "SANG_CHANNEL_UNSUPPORTED",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects a size mismatch before calling the upstream", async () => {
    const fetchImpl = vi.fn();

    await expect(
      uploadToSang(
        {
          ...baseParams,
          sizeBytes: 999,
        },
        {
          endpoint: "https://file.sang.pub/api/upload",
          fetchImpl: fetchImpl as unknown as typeof fetch,
          sleep: noSleep,
        },
      ),
    ).rejects.toMatchObject({
      status: 400,
      code: "SANG_SIZE_MISMATCH",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
