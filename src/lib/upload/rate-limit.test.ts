import { describe, expect, it } from "vitest";

import { FixedWindowRateLimiter } from "@/lib/upload/rate-limit";

describe("FixedWindowRateLimiter", () => {
  it("allows requests up to the limit and rejects the next one", () => {
    const limiter = new FixedWindowRateLimiter(2, 1_000);

    expect(limiter.consume("user", 0).allowed).toBe(true);
    expect(limiter.consume("user", 100).allowed).toBe(true);

    const rejected = limiter.consume("user", 200);
    expect(rejected.allowed).toBe(false);
    expect(rejected.retryAfterMs).toBe(800);
  });

  it("resets after the window elapses", () => {
    const limiter = new FixedWindowRateLimiter(1, 1_000);

    expect(limiter.consume("user", 0).allowed).toBe(true);
    expect(limiter.consume("user", 500).allowed).toBe(false);
    expect(limiter.consume("user", 1_000).allowed).toBe(true);
  });

  it("isolates users", () => {
    const limiter = new FixedWindowRateLimiter(1, 1_000);

    expect(limiter.consume("a", 0).allowed).toBe(true);
    expect(limiter.consume("b", 0).allowed).toBe(true);
  });

  it("rejects invalid configuration", () => {
    expect(() => new FixedWindowRateLimiter(0, 1_000)).toThrowError();
    expect(() => new FixedWindowRateLimiter(1, 0)).toThrowError();
  });
});
