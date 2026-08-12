import "server-only";

import { getRedisClient } from "@/lib/redis-client";
import { LUA_SCRIPTS } from "@/lib/redis-lua-scripts";
import { RedisTimeoutError, RedisUnavailableError, RedisCompensationFailedError } from "@/lib/redis-errors";

type RedisOperationResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
  fallbackUsed?: boolean;
};

export async function redisCheckAndDecrement(
  eventId: string,
  capacity: number,
  timeoutMs = 500
): Promise<RedisOperationResult<number>> {
  try {
    const redis = await getRedisClient();

    if (!redis) {
      console.warn(`[Redis] Unavailable for checkAndDecrement on event ${eventId}. Proceeding with DB-only fallback.`);
      return { success: false, error: "Redis unavailable", fallbackUsed: true };
    }

    const key = `event:${eventId}:capacity`;

    const result = await Promise.race([
      redis.eval(LUA_SCRIPTS.checkAndDecrement, 1, key, capacity, eventId),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new RedisTimeoutError()), timeoutMs)
      )
    ]);

    if (
      result &&
      typeof result === "object" &&
      "err" in result &&
      result.err === "SOLD_OUT"
    ) {
      return { success: false, error: "SOLD_OUT" };
    }

    if (
      result &&
      typeof result === "object" &&
      "ok" in result &&
      typeof result.ok === "number"
    ) {
      return { success: true, data: result.ok };
    }

    return { success: false, error: "Unexpected Redis response" };
  } catch (error) {
    if (error instanceof RedisTimeoutError) {
      console.warn(`[Redis] checkAndDecrement timeout on event ${eventId}. Proceeding with DB-only fallback.`);
      return { success: false, error: "timeout", fallbackUsed: true };
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn(`[Redis] checkAndDecrement failed on event ${eventId}: ${errorMessage}. Proceeding with DB-only fallback.`);
    return { success: false, error: errorMessage, fallbackUsed: true };
  }
}

export async function redisRollbackIncrement(
  eventId: string,
  timeoutMs = 500
): Promise<RedisOperationResult<number>> {
  try {
    const redis = await getRedisClient();

    if (!redis) {
      const errorMsg = `Redis unavailable during rollback for event ${eventId}`;
      console.error(`[Redis Compensation] ${errorMsg}. ALERT: Manual intervention may be required.`);
      return { success: false, error: "Redis unavailable" };
    }

    const key = `event:${eventId}:capacity`;

    const result = await Promise.race([
      redis.eval(LUA_SCRIPTS.rollbackIncrement, 1, key),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new RedisTimeoutError()), timeoutMs)
      )
    ]);

    if (
      result &&
      typeof result === "object" &&
      "ok" in result &&
      typeof result.ok === "number"
    ) {
      console.log(`[Redis Compensation] Successfully rolled back event ${eventId}. Capacity restored.`);
      return { success: true, data: result.ok };
    }

    return { success: false, error: "Unexpected Redis response" };
  } catch (error) {
    if (error instanceof RedisTimeoutError) {
      const errorMsg = `Redis timeout during rollback for event ${eventId}`;
      console.error(`[Redis Compensation] ${errorMsg}. ALERT: Manual intervention may be required.`);
      return { success: false, error: "timeout" };
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Redis Compensation] Rollback failed for event ${eventId}: ${errorMessage}. ALERT: Manual intervention may be required.`);
    return { success: false, error: errorMessage };
  }
}

export async function redisSeedCapacity(
  eventId: string,
  capacity: number,
  timeoutMs = 500
): Promise<RedisOperationResult<number>> {
  try {
    const redis = await getRedisClient();

    if (!redis) {
      return { success: false, error: "Redis unavailable" };
    }

    const key = `event:${eventId}:capacity`;

    const result = await Promise.race([
      redis.eval(LUA_SCRIPTS.seedCapacity, 1, key, capacity, eventId),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Redis timeout")), timeoutMs)
      )
    ]);

    if (
      result &&
      typeof result === "object" &&
      "ok" in result &&
      typeof result.ok === "number"
    ) {
      return { success: true, data: result.ok };
    }

    return { success: false, error: "Unexpected Redis response" };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn(`[Redis] seedCapacity failed: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}
