import "server-only";

import { getRedisClient } from "@/lib/redis-client";

/**
 * Sliding-window rate limiter per tenant / API key.
 * Guarantees zero denial-of-service on the Redis connection pool
 * from rogue CI/CD loops.
 */
export async function checkTenantRateLimit(
  tenantId: string,
  limit = 60,
  windowSeconds = 60
): Promise<{ allowed: boolean; remaining: number }> {
  try {
    const redis = getRedisClient();
    const key = `ratelimit:tenant:${tenantId}`;

    const current = await redis.incr(key);
    if (current === 1) {
      await redis.expire(key, windowSeconds);
    }

    if (current > limit) {
      return { allowed: false, remaining: 0 };
    }

    return { allowed: true, remaining: Math.max(0, limit - current) };
  } catch (err) {
    // Fail-open: Never block legitimate users if Redis has transient issues
    console.error("[Tenant Rate Limiter] Transient Redis error, failing open:", err);
    return { allowed: true, remaining: 1 };
  }
}

