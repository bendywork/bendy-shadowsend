import { describe, expect, it, vi } from "vitest";
import {
  parseRetryAfterMs,
  PicSlClient,
  PicSlError,
} from "@/lib/pic-sl";

type RecordedCall = {
  url: string;
  init: RequestInit;
};

function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...headers,
    },
  });
}

function tokenResponse(token: string, cookie = "sess-1") {
  return jsonResponse(
    { ok: true, token, expires_in: 600 },
    200,
    { "set-cookie": `__Host-imgsess=${cookie}; Path=/; HttpOnly; SameSite=Strict` },
  );
}

function uploadResponse(url = "https://pic.sl.al/f/pic/2026-10-18/fileid_abc_report.pdf") {
  return jsonResponse({
    success: true,
    data: {
      url,
      file_id: "fileid_abc",
      path: "/f/pic/2026-10-18/fileid_abc_report.pdf",
      size: 3,
      type: "application/pdf",
      filename: "report.pdf",
    },
  });
}

function headersOf(call: RecordedCall): Record<string, string> {
  return call.init.headers as Record<string, string>;
}

function createClient(fetchImpl: typeof fetch) {
  return new PicSlClient({
    fetchImpl,
    prefetchTokens: false,
    now: () => 1_700_000_000_000,
    random: () => 0.5,
  });
}

describe("PicSlClient", () => {
  it("fetches a token with the required headers and uploads raw bytes", async () => {
    const calls: RecordedCall[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init: init ?? {} });
      return calls.length === 1 ? tokenResponse("tok-1") : uploadResponse();
    }) as unknown as typeof fetch;

    const client = createClient(fetchImpl);
    const result = await client.upload({
      fileName: "中文 报告.PDF",
      mimeType: "application/pdf",
      body: new Uint8Array([1, 2, 3]),
    });

    expect(result.url).toBe(
      "https://pic.sl.al/f/pic/2026-10-18/fileid_abc_report.pdf",
    );
    expect(result.attempts).toBe(1);
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe("https://pic.sl.al/api/upload-token");
    expect(calls[1].url).toBe("https://pic.sl.al/api/upload");

    const tokenHeaders = headersOf(calls[0]);
    expect(tokenHeaders.Referer).toBe("https://pic.sl.al/");
    expect(tokenHeaders["X-Requested-With"]).toBe("XMLHttpRequest");
    expect(tokenHeaders["User-Agent"]).toContain("BendyShadowSend/");

    const uploadHeaders = headersOf(calls[1]);
    expect(uploadHeaders["X-Upload-Token"]).toBe("tok-1");
    expect(uploadHeaders.Cookie).toBe("__Host-imgsess=sess-1");
    expect(uploadHeaders["Content-Type"]).toBe("application/pdf");
    expect(uploadHeaders["X-Filename"]).toMatch(/^[\x20-\x7E]+\.pdf$/);
    expect(uploadHeaders["X-Filename"]).not.toMatch(/[^\x20-\x7E]/);
    expect(calls[1].init.body).toBeInstanceOf(ArrayBuffer);
  });

  it("retries retryable statuses with a fresh token and honors Retry-After", async () => {
    const calls: RecordedCall[] = [];
    const sleep = vi.fn(async () => {});
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init: init ?? {} });
      if (calls.length === 1) return tokenResponse("tok-1");
      if (calls.length === 2) {
        return jsonResponse(
          { success: false, error: "busy" },
          503,
          { "retry-after": "2" },
        );
      }
      if (calls.length === 3) return tokenResponse("tok-2");
      return uploadResponse();
    }) as unknown as typeof fetch;

    const client = new PicSlClient({
      fetchImpl,
      prefetchTokens: false,
      now: () => 1_700_000_000_000,
      random: () => 0.5,
      sleep,
    });

    const result = await client.upload({
      fileName: "report.pdf",
      mimeType: "application/pdf",
      body: new Uint8Array([1, 2, 3]),
    });

    expect(result.attempts).toBe(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(2000);
    expect(headersOf(calls[3])["X-Upload-Token"]).toBe("tok-2");
  });

  it("refreshes the token after a 403 and succeeds", async () => {
    const calls: RecordedCall[] = [];
    const sleep = vi.fn(async () => {});
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init: init ?? {} });
      if (calls.length === 1) return tokenResponse("tok-1");
      if (calls.length === 2) return jsonResponse({ error: "Forbidden" }, 403);
      if (calls.length === 3) return tokenResponse("tok-2");
      return uploadResponse();
    }) as unknown as typeof fetch;

    const client = new PicSlClient({
      fetchImpl,
      prefetchTokens: false,
      now: () => 1_700_000_000_000,
      random: () => 0.5,
      sleep,
    });

    const result = await client.upload({
      fileName: "report.pdf",
      mimeType: "application/pdf",
      body: new Uint8Array([1, 2, 3]),
    });

    expect(result.attempts).toBe(2);
    expect(headersOf(calls[3])["X-Upload-Token"]).toBe("tok-2");
  });

  it("does not retry unsupported file types", async () => {
    const calls: RecordedCall[] = [];
    const sleep = vi.fn(async () => {});
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init: init ?? {} });
      if (calls.length === 1) return tokenResponse("tok-1");
      return jsonResponse(
        { success: false, error: "不支持的文件类型" },
        415,
      );
    }) as unknown as typeof fetch;

    const client = new PicSlClient({
      fetchImpl,
      prefetchTokens: false,
      now: () => 1_700_000_000_000,
      random: () => 0.5,
      sleep,
    });

    await expect(
      client.upload({
        fileName: "report.pdf",
        mimeType: "application/pdf",
        body: new Uint8Array([1, 2, 3]),
      }),
    ).rejects.toMatchObject({
      code: "PIC_SL_UNSUPPORTED_TYPE",
      retryable: false,
    });

    expect(calls).toHaveLength(2);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("rejects non-official response URLs", async () => {
    const calls: RecordedCall[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init: init ?? {} });
      if (calls.length % 2 === 1) {
        return tokenResponse(`tok-${calls.length}`);
      }
      return uploadResponse("https://evil.example/f/pic/x.pdf");
    }) as unknown as typeof fetch;

    const client = new PicSlClient({
      fetchImpl,
      prefetchTokens: false,
      now: () => 1_700_000_000_000,
      random: () => 0.5,
      sleep: async () => {},
    });

    await expect(
      client.upload({
        fileName: "report.pdf",
        mimeType: "application/pdf",
        body: new Uint8Array([1, 2, 3]),
      }),
    ).rejects.toBeInstanceOf(PicSlError);

    expect(calls).toHaveLength(6);
  });

  it("rejects unsupported extensions before making a request", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const client = createClient(fetchImpl);

    await expect(
      client.upload({
        fileName: "payload.exe",
        mimeType: "application/octet-stream",
        body: new Uint8Array([1]),
      }),
    ).rejects.toMatchObject({ code: "PIC_SL_UNSUPPORTED_TYPE" });

    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("parseRetryAfterMs", () => {
  it("parses seconds and caps the delay", () => {
    expect(parseRetryAfterMs("2")).toBe(2000);
    expect(parseRetryAfterMs("999")).toBe(10_000);
  });

  it("parses HTTP dates", () => {
    const now = Date.parse("2026-10-18T00:00:00Z");
    expect(
      parseRetryAfterMs("Sun, 18 Oct 2026 00:00:03 GMT", now),
    ).toBe(3000);
  });

  it("returns null for invalid values", () => {
    expect(parseRetryAfterMs(null)).toBeNull();
    expect(parseRetryAfterMs("not-a-date")).toBeNull();
  });
});
