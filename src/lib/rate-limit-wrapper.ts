import "server-only";

import { applyRateLimit, createRateLimitError } from "@/lib/rate-limit-hook";
import { RATE_LIMIT_POLICIES, type RateLimitPolicy } from "@/lib/rate-limit-config";
import { env } from "@/lib/env";

export type IdentifierExtractor<T extends any[]> = (...args: T) => string;

export type RateLimitedAction<T extends any[], R> = (...args: T) => Promise<R>;

export function withRateLimit<T extends any[], R>(
  policy: RateLimitPolicy | keyof typeof RATE_LIMIT_POLICIES,
  action: (...args: T) => Promise<R>,
  identifierExtractor: IdentifierExtractor<T>
): RateLimitedAction<T, R> {
  return async (...args: T): Promise<R> => {
    // Get policy if key provided
    const policyObj = typeof policy === "string" ? RATE_LIMIT_POLICIES[policy] : policy;

    if (!policyObj) {
      console.error(`[RateLimit] Unknown policy: ${policy}`);
      return action(...args);
    }

    // Check if rate limiting is enabled
    if (env.ENABLE_RATE_LIMITING !== "true") {
      return action(...args);
    }

    // Extract identifier
    const identifier = identifierExtractor(...args);

    // Apply rate limit
    const result = await applyRateLimit(policyObj, identifier);

    // Check if allowed
    if (!result.allowed && env.RATE_LIMIT_STRICT_MODE === "true") {
      const error = createRateLimitError(result);
      throw error;
    }

    // Execute original action
    return action(...args);
  };
}

export function createServerActionRateLimitWrapper<T extends any[], R>(
  policyName: keyof typeof RATE_LIMIT_POLICIES,
  identifierExtractor: IdentifierExtractor<T>
) {
  return (action: (...args: T) => Promise<R>): RateLimitedAction<T, R> => {
    return withRateLimit(policyName, action, identifierExtractor);
  };
}
