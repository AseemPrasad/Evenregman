import "server-only";

import { getRedisClient } from "@/lib/redis-client";

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  reset_at: number;
  retry_after?: number;
};

export type RateLimitConfig = {
  window_ms: number;
  max_requests: number;
  key_prefix: string;
};

class SlidingWindowRateLimiter {
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = config;
  }

  async checkRateLimit(identifier: string): Promise<RateLimitResult> {
    const redis = await getRedisClient();

    if (!redis) {
      return { allowed: true, remaining: this.config.max_requests, reset_at: Date.now() + this.config.window_ms };
    }

    try {
      const key = `${this.config.key_prefix}:${identifier}`;
      const now = Date.now();
      const window_start = now - this.config.window_ms;

      const pipeline = redis.pipeline();

      pipeline.zremrangebyscore(key, "-inf", window_start);
      pipeline.zcard(key);

      const results = await pipeline.exec();

      if (!results) {
        return { allowed: true, remaining: this.config.max_requests, reset_at: now + this.config.window_ms };
      }

      const count = (results[1]?.[1] as number) ?? 0;

      const allowed = count < this.config.max_requests;

      if (allowed) {
        await redis.zadd(key, now, now.toString());
        await redis.expire(key, Math.ceil(this.config.window_ms / 1000));
      }

      const remaining = Math.max(0, this.config.max_requests - count - (allowed ? 1 : 0));
      const reset_at = now + this.config.window_ms;
      const retry_after = allowed ? undefined : Math.ceil((reset_at - now) / 1000);

      return {
        allowed,
        remaining,
        reset_at,
        retry_after
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(`[RateLimit] Error checking rate limit for ${identifier}: ${errorMessage}`);
      return { allowed: true, remaining: this.config.max_requests, reset_at: Date.now() + this.config.window_ms };
    }
  }
}

export { SlidingWindowRateLimiter };
