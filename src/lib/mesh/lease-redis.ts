import "server-only";

import { getRedisClient } from "@/lib/redis-client";

/**
 * Lua scripts dedicated to Self-Healing Expiring Leases.
 * These scripts provide atomic reservation with automatic TTL expiration,
 * eliminating the ghost inventory leakage risk.
 */
export const LEASE_LUA_SCRIPTS = {
  /**
   * Atomically checks available capacity and reserves a leased slot with a TTL.
   * KEYS[1]: capacity counter key (e.g. `mesh:res:{id}:slots`)
   * KEYS[2]: lease token tracking key (e.g. `mesh:lease:{leaseId}`)
   * ARGV[1]: max slots (capacity)
   * ARGV[2]: lease duration in seconds (TTL)
   * ARGV[3]: user ID / metadata payload
   */
  acquireLease: `
    local countKey = KEYS[1]
    local leaseKey = KEYS[2]
    local maxSlots = tonumber(ARGV[1])
    local ttlSeconds = tonumber(ARGV[2])
    local metadata = ARGV[3]

    local current = redis.call('GET', countKey)
    if not current then
      redis.call('SET', countKey, tostring(maxSlots))
      current = maxSlots
    else
      current = tonumber(current)
    end

    if current <= 0 then
      return {err = "EXHAUSTED"}
    end

    local remaining = redis.call('DECR', countKey)
    if remaining < 0 then
      redis.call('INCR', countKey)
      return {err = "EXHAUSTED"}
    end

    redis.call('SET', leaseKey, metadata, 'EX', ttlSeconds)
    return {ok = remaining}
  `,

  /**
   * Explicit early release of a lease, incrementing back the available capacity.
   * KEYS[1]: capacity counter key
   * KEYS[2]: lease token tracking key
   */
  releaseLease: `
    local countKey = KEYS[1]
    local leaseKey = KEYS[2]

    local exists = redis.call('DEL', leaseKey)
    if exists == 1 then
      local newCount = redis.call('INCR', countKey)
      return {ok = newCount}
    end

    return {ok = 0}
  `,

  /**
   * Extends the TTL of an active lease if it exists.
   * KEYS[1]: lease token tracking key
   * ARGV[1]: additional seconds to extend
   */
  extendLease: `
    local leaseKey = KEYS[1]
    local addSeconds = tonumber(ARGV[1])

    local ttl = redis.call('TTL', leaseKey)
    if ttl > 0 then
      local newTtl = ttl + addSeconds
      redis.call('EXPIRE', leaseKey, newTtl)
      return {ok = newTtl}
    end

    return {err = "NOT_FOUND_OR_EXPIRED"}
  `
} as const;

export async function redisAcquireLease(
  resourceId: string,
  leaseId: string,
  maxSlots: number,
  ttlSeconds: number,
  metadata: string
): Promise<{ success: boolean; remainingSlots?: number; error?: string }> {
  try {
    const redis = getRedisClient();
    const countKey = `mesh:res:${resourceId}:slots`;
    const leaseKey = `mesh:lease:${leaseId}`;

    const result = (await redis.eval(
      LEASE_LUA_SCRIPTS.acquireLease,
      2,
      countKey,
      leaseKey,
      maxSlots.toString(),
      ttlSeconds.toString(),
      metadata
    )) as { ok?: number; err?: string };

    if (result && typeof result.ok === "number") {
      return { success: true, remainingSlots: result.ok };
    }

    return { success: false, error: result?.err ?? "ACQUISITION_FAILED" };
  } catch (err) {
    console.error("[Mesh Redis] Failed to acquire lease:", err);
    return { success: false, error: "REDIS_UNAVAILABLE" };
  }
}

export async function redisReleaseLease(
  resourceId: string,
  leaseId: string
): Promise<{ success: boolean }> {
  try {
    const redis = getRedisClient();
    const countKey = `mesh:res:${resourceId}:slots`;
    const leaseKey = `mesh:lease:${leaseId}`;

    await redis.eval(LEASE_LUA_SCRIPTS.releaseLease, 2, countKey, leaseKey);
    return { success: true };
  } catch (err) {
    console.error("[Mesh Redis] Failed to release lease:", err);
    return { success: false };
  }
}

export async function redisExtendLease(
  leaseId: string,
  extensionSeconds: number
): Promise<{ success: boolean; newTtl?: number }> {
  try {
    const redis = getRedisClient();
    const leaseKey = `mesh:lease:${leaseId}`;

    const result = (await redis.eval(
      LEASE_LUA_SCRIPTS.extendLease,
      1,
      leaseKey,
      extensionSeconds.toString()
    )) as { ok?: number; err?: string };

    if (result && typeof result.ok === "number") {
      return { success: true, newTtl: result.ok };
    }

    return { success: false };
  } catch (err) {
    console.error("[Mesh Redis] Failed to extend lease:", err);
    return { success: false };
  }
}

