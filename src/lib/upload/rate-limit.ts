import { ApiError } from "@/lib/api";
import {
  UPLOAD_RATE_LIMIT_PER_MINUTE,
  UPLOAD_RATE_LIMIT_WINDOW_MS,
} from "@/lib/upload/constants";

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
};

type Bucket = {
  windowStart: number;
  count: number;
};

export class FixedWindowRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {
    if (limit <= 0 || windowMs <= 0) {
      throw new Error("Rate limiter limit and window must be positive");
    }
  }

  consume(key: string, now: number = Date.now()): RateLimitResult {
    const bucket = this.buckets.get(key);

    if (!bucket || now - bucket.windowStart >= this.windowMs) {
      this.buckets.set(key, { windowStart: now, count: 1 });
      this.pruneIfNeeded(now);
      return { allowed: true, remaining: this.limit - 1, retryAfterMs: 0 };
    }

    if (bucket.count >= this.limit) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: Math.max(0, bucket.windowStart + this.windowMs - now),
      };
    }

    bucket.count += 1;
    return {
      allowed: true,
      remaining: Math.max(0, this.limit - bucket.count),
      retryAfterMs: 0,
    };
  }

  reset(): void {
    this.buckets.clear();
  }

  private pruneIfNeeded(now: number): void {
    if (this.buckets.size < 5_000) {
      return;
    }

    for (const [key, bucket] of this.buckets) {
      if (now - bucket.windowStart >= this.windowMs) {
        this.buckets.delete(key);
      }
    }
  }
}

export const uploadRateLimiter = new FixedWindowRateLimiter(
  UPLOAD_RATE_LIMIT_PER_MINUTE,
  UPLOAD_RATE_LIMIT_WINDOW_MS,
);

export function assertUploadRateLimit(
  userId: string,
  now: number = Date.now(),
): void {
  const result = uploadRateLimiter.consume(userId, now);
  if (result.allowed) {
    return;
  }

  const seconds = Math.max(1, Math.ceil(result.retryAfterMs / 1000));
  throw new ApiError(
    429,
    `上传过于频繁，请在 ${seconds} 秒后重试`,
    "UPLOAD_RATE_LIMITED",
  );
}
