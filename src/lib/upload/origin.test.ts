import { describe, expect, it } from "vitest";

import {
  isSameOriginUpload,
  parseAllowedOrigins,
} from "@/lib/upload/origin";

const base = {
  origin: null,
  referer: null,
  host: "bendy-shadowsend.vercel.app",
  forwardedHost: null,
  secFetchSite: null,
};

describe("isSameOriginUpload", () => {
  it("accepts an origin matching the request host", () => {
    expect(
      isSameOriginUpload({
        ...base,
        origin: "https://bendy-shadowsend.vercel.app",
      }),
    ).toBe(true);
  });

  it("accepts a referer when origin is absent", () => {
    expect(
      isSameOriginUpload({
        ...base,
        referer: "https://bendy-shadowsend.vercel.app/rooms/abc",
      }),
    ).toBe(true);
  });

  it("accepts an explicitly allowed origin", () => {
    expect(
      isSameOriginUpload({
        ...base,
        origin: "https://shadowsend.example.com",
        allowedOrigins: ["https://shadowsend.example.com"],
      }),
    ).toBe(true);
  });

  it("rejects cross-site and foreign origins", () => {
    expect(
      isSameOriginUpload({ ...base, origin: "https://evil.example.com" }),
    ).toBe(false);
    expect(
      isSameOriginUpload({
        ...base,
        origin: "https://bendy-shadowsend.vercel.app",
        secFetchSite: "cross-site",
      }),
    ).toBe(false);
    expect(isSameOriginUpload(base)).toBe(false);
  });

  it("uses the first forwarded host", () => {
    expect(
      isSameOriginUpload({
        ...base,
        host: "internal.vercel",
        forwardedHost: "shadowsend.example.com, proxy.internal",
        origin: "https://shadowsend.example.com",
      }),
    ).toBe(true);
  });
});

describe("parseAllowedOrigins", () => {
  it("splits and trims comma-separated origins", () => {
    expect(parseAllowedOrigins(" https://a.example , https://b.example ")).toEqual([
      "https://a.example",
      "https://b.example",
    ]);
    expect(parseAllowedOrigins(undefined)).toEqual([]);
  });
});
