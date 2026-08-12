import "server-only";

import { SlidingWindowRateLimiter, type RateLimitResult } from "@/lib/rate-limiter";
import { RATE_LIMIT_POLICIES, type RateLimitPolicy } from "@/lib/rate-limit-config";
import { env } from "@/lib/env";

const rateLimiters: Map<string, SlidingWindowRateLimiter> = new Map();

function getRateLimiter(policy: RateLimitPolicy): SlidingWindowRateLimiter {
  if (!rateLimiters.has(policy.name)) {
    rateLimiters.set(
      policy.name,
      new SlidingWindowRateLimiter({
        window_ms: policy.window_ms,
        max_requests: policy.max_requests,
        key_prefix: policy.key_prefix
      })
    );
  }
  return rateLimiters.get(policy.name)!;
}

export async function applyRateLimit(
  policy: RateLimitPolicy,
  identifier: string
): Promise<RateLimitResult> {
  const isEnabled = env.ENABLE_RATE_LIMITING === "true" && policy.enabled;

  if (!isEnabled) {
    return {
      allowed: true,
      remaining: policy.max_requests,
      reset_at: Date.now() + policy.window_ms
    };
  }

  const limiter = getRateLimiter(policy);
  const result = await limiter.checkRateLimit(identifier);

  if (!result.allowed) {
    console.warn(`[RateLimit] Violation: ${policy.name} for ${identifier}`);
  }

  return result;
}

export function createRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    "X-RateLimit-Limit": "unknown",
    "X-RateLimit-Remaining": result.remaining.toString(),
    "X-RateLimit-Reset": Math.floor(result.reset_at / 1000).toString()
  };

  if (result.retry_after !== undefined) {
    headers["Retry-After"] = result.retry_after.toString();
  }

  return headers;
}

export class RateLimitError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly headers: Record<string, string>
  ) {
    super(message);
    this.name = "RateLimitError";
  }
}

export function createRateLimitError(result: RateLimitResult): RateLimitError {
  const headers = createRateLimitHeaders(result);
  return new RateLimitError(
    429,
    "Too many requests",
    headers
  );
}
