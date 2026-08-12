import "server-only";

import { SlidingWindowRateLimiter, type RateLimitResult } from "@/lib/rate-limiter";
import { RATE_LIMIT_POLICIES, type RateLimitPolicy } from "@/lib/rate-limit-config";
import { env } from "@/lib/env";
import { rateLimitMetrics } from "@/lib/rate-limit-metrics";
import { RateLimitError } from "@/lib/rate-limit-errors";

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

  try {
    const startTime = Date.now();
    const limiter = getRateLimiter(policy);
    const result = await limiter.checkRateLimit(identifier);
    const latencyMs = Date.now() - startTime;

    rateLimitMetrics.recordCheck(latencyMs);

    if (!result.allowed) {
      console.warn(`[RateLimit] Violation: ${policy.name} for ${identifier}`);
      rateLimitMetrics.recordViolation(policy.name, identifier, latencyMs);
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[RateLimit] Error applying rate limit: ${errorMessage}`);
    return {
      allowed: true,
      remaining: policy.max_requests,
      reset_at: Date.now() + policy.window_ms
    };
  }
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

export function createRateLimitError(
  result: RateLimitResult,
  policyName: string,
  identifier: string
): RateLimitError {
  const headers = createRateLimitHeaders(result);
  return new RateLimitError(
    "Too many requests",
    429,
    headers,
    policyName,
    identifier,
    result.retry_after
  );
}
