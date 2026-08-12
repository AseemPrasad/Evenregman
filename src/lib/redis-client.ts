import "server-only";

import Redis, { type RedisOptions } from "ioredis";

import { env } from "@/lib/env";

type RedisClientCache = {
  client: Redis | null;
  promise: Promise<Redis> | null;
};

declare global {
  // eslint-disable-next-line no-var
  var redisClientCache: RedisClientCache | undefined;
}

const cached = globalThis.redisClientCache ?? {
  client: null,
  promise: null
};

if (process.env.NODE_ENV !== "production") {
  globalThis.redisClientCache = cached;
}

export async function getRedisClient(): Promise<Redis | null> {
  if (!env.REDIS_URL) {
    return null;
  }

  if (cached.client) {
    return cached.client;
  }

  if (!cached.promise) {
    cached.promise = createRedisClient();
  }

  cached.client = await cached.promise;
  return cached.client;
}

async function createRedisClient(): Promise<Redis> {
  const redisOptions: RedisOptions = {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    enableReadyCheck: false,
    enableOfflineQueue: false,
    connectTimeout: 5000,
    commandTimeout: 5000,
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    }
  };

  const redis = new Redis(env.REDIS_URL, redisOptions);

  redis.on("error", (error) => {
    console.warn("[Redis] Connection error (continuing with degraded mode):", error.message);
  });

  redis.on("connect", () => {
    console.log("[Redis] Successfully connected");
  });

  redis.on("close", () => {
    console.warn("[Redis] Connection closed");
  });

  try {
    await redis.connect();
    await redis.ping();
  } catch (error) {
    console.warn("[Redis] Failed to connect during initialization:", error instanceof Error ? error.message : String(error));
    redis.disconnect();
    throw error;
  }

  return redis;
}

export async function disconnectRedis(): Promise<void> {
  if (cached.client) {
    await cached.client.quit();
    cached.client = null;
  }
  cached.promise = null;
}
