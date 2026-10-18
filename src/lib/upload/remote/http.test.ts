import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  fetchRemote,
  parseRetryAfter,
  RemoteUploadError,
} from "@/lib/upload/remote/http";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function textResponse(body: string, status = 200): Response {
  return new Response(body, { status });
}

describe("fetchRemote", () => {
  it("returns successful responses", async () => {
    fetchMock.mockResolvedValueOnce(textResponse("ok"));

    const response = await fetchRemote("https://example.com/upload", { method: "POST" });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries retryable statuses and returns the final success", async () => {
    fetchMock
      .mockResolvedValueOnce(textResponse("busy", 503))
      .mockResolvedValueOnce(textResponse("ok"));

    const response = await fetchRemote(
      "https://example.com/upload",
      { method: "POST" },
      { retryDelayMs: 1, maxRetryDelayMs: 1 },
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-retryable statuses", async () => {
    fetchMock.mockResolvedValueOnce(textResponse("bad", 400));

    const response = await fetchRemote("https://example.com/upload", { method: "POST" });

    expect(response.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws a RemoteUploadError after exhausting network retries", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    await expect(
      fetchRemote(
        "https://example.com/upload",
        { method: "POST" },
        { attempts: 2, retryDelayMs: 1, maxRetryDelayMs: 1 },
      ),
    ).rejects.toBeInstanceOf(RemoteUploadError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("parseRetryAfter", () => {
  it("parses seconds and caps the delay", () => {
    expect(parseRetryAfter("2", 5_000)).toBe(2_000);
    expect(parseRetryAfter("60", 5_000)).toBe(5_000);
    expect(parseRetryAfter("0")).toBe(0);
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter("not-a-date")).toBeNull();
  });
});
