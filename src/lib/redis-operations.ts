import "server-only";

import { getRedisClient } from "@/lib/redis-client";
import { LUA_SCRIPTS } from "@/lib/redis-lua-scripts";

type RedisOperationResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

export async function redisCheckAndDecrement(
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
      redis.eval(LUA_SCRIPTS.checkAndDecrement, 1, key, capacity, eventId),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Redis timeout")), timeoutMs)
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
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn(`[Redis] checkAndDecrement failed: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}

export async function redisRollbackIncrement(
  eventId: string,
  timeoutMs = 500
): Promise<RedisOperationResult<number>> {
  try {
    const redis = await getRedisClient();

    if (!redis) {
      return { success: false, error: "Redis unavailable" };
    }

    const key = `event:${eventId}:capacity`;

    const result = await Promise.race([
      redis.eval(LUA_SCRIPTS.rollbackIncrement, 1, key),
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
    console.warn(`[Redis] rollbackIncrement failed: ${errorMessage}`);
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
