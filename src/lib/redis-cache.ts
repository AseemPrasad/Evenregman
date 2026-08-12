import "server-only";

import Redis from "ioredis";
import { env } from "@/lib/env";
import { getCacheCompressionConfig } from "@/lib/cache-config";
import * as zlib from "zlib";
import { promisify } from "util";

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

let redisInstance: Redis | null = null;
let isInitialized = false;

export function getRedisInstance(): Redis | null {
  if (env.ENABLE_L2_CACHE !== "true") {
    return null;
  }

  if (!redisInstance && env.REDIS_URL) {
    try {
      redisInstance = new Redis(env.REDIS_URL, {
        retryStrategy: (times) => Math.min(times * 50, 2000),
        maxRetriesPerRequest: 3,
        lazyConnect: true
      });

      redisInstance.on("error", (err) => {
        console.error("[Cache] Redis error:", err);
      });

      redisInstance.on("connect", () => {
        console.log("[Cache] Redis connected");
      });
    } catch (err) {
      console.error("[Cache] Failed to initialize Redis:", err);
      return null;
    }
  }

  return redisInstance;
}

interface CachedValue {
  data: any;
  compressed: boolean;
  timestamp: number;
}

async function compressData(data: string): Promise<Buffer> {
  try {
    return await gzip(data);
  } catch (err) {
    console.error("[Cache] Compression error:", err);
    return Buffer.from(data);
  }
}

async function decompressData(buffer: Buffer): Promise<string> {
  try {
    const decompressed = await gunzip(buffer);
    return decompressed.toString("utf-8");
  } catch (err) {
    console.error("[Cache] Decompression error:", err);
    return buffer.toString("utf-8");
  }
}

export async function cacheGet<T = any>(key: string): Promise<T | null> {
  if (env.ENABLE_L2_CACHE !== "true") {
    return null;
  }

  const redis = getRedisInstance();
  if (!redis) {
    return null;
  }

  try {
    const raw = await redis.getBuffer(key);
    if (!raw) {
      return null;
    }

    const cached = JSON.parse(raw.toString("utf-8")) as CachedValue;

    if (cached.compressed) {
      const decompressed = await decompressData(Buffer.from(cached.data, "base64"));
      return JSON.parse(decompressed) as T;
    }

    return cached.data as T;
  } catch (err) {
    console.error("[Cache] Error reading from cache:", err);
    return null;
  }
}

export async function cacheSet<T = any>(
  key: string,
  value: T,
  ttlSeconds: number
): Promise<void> {
  if (env.ENABLE_L2_CACHE !== "true") {
    return;
  }

  const redis = getRedisInstance();
  if (!redis) {
    return;
  }

  try {
    const compressionConfig = getCacheCompressionConfig();
    const serialized = JSON.stringify(value);

    let cached: CachedValue;

    if (compressionConfig.enabled && serialized.length > compressionConfig.thresholdBytes) {
      const compressed = await compressData(serialized);
      cached = {
        data: compressed.toString("base64"),
        compressed: true,
        timestamp: Date.now()
      };
    } else {
      cached = {
        data: value,
        compressed: false,
        timestamp: Date.now()
      };
    }

    const serializedCache = JSON.stringify(cached);
    await redis.setex(key, ttlSeconds, serializedCache);
  } catch (err) {
    console.error("[Cache] Error writing to cache:", err);
  }
}

export async function cacheDel(key: string): Promise<void> {
  if (env.ENABLE_L2_CACHE !== "true") {
    return;
  }

  const redis = getRedisInstance();
  if (!redis) {
    return;
  }

  try {
    await redis.del(key);
  } catch (err) {
    console.error("[Cache] Error deleting from cache:", err);
  }
}

export async function cacheDelPattern(pattern: string): Promise<number> {
  if (env.ENABLE_L2_CACHE !== "true") {
    return 0;
  }

  const redis = getRedisInstance();
  if (!redis) {
    return 0;
  }

  try {
    const keys = await redis.keys(pattern);
    if (keys.length === 0) {
      return 0;
    }

    await redis.del(...keys);
    return keys.length;
  } catch (err) {
    console.error("[Cache] Error deleting pattern from cache:", err);
    return 0;
  }
}

export async function cacheExists(key: string): Promise<boolean> {
  if (env.ENABLE_L2_CACHE !== "true") {
    return false;
  }

  const redis = getRedisInstance();
  if (!redis) {
    return false;
  }

  try {
    const exists = await redis.exists(key);
    return exists === 1;
  } catch (err) {
    console.error("[Cache] Error checking cache existence:", err);
    return false;
  }
}

export async function cacheGetTTL(key: string): Promise<number> {
  if (env.ENABLE_L2_CACHE !== "true") {
    return -2;
  }

  const redis = getRedisInstance();
  if (!redis) {
    return -2;
  }

  try {
    return await redis.ttl(key);
  } catch (err) {
    console.error("[Cache] Error getting TTL:", err);
    return -2;
  }
}

export async function cacheFlush(): Promise<void> {
  if (env.ENABLE_L2_CACHE !== "true") {
    return;
  }

  const redis = getRedisInstance();
  if (!redis) {
    return;
  }

  try {
    await redis.flushdb();
    console.log("[Cache] Cache flushed");
  } catch (err) {
    console.error("[Cache] Error flushing cache:", err);
  }
}

export async function disconnectCache(): Promise<void> {
  if (redisInstance) {
    await redisInstance.quit();
    redisInstance = null;
    isInitialized = false;
    console.log("[Cache] Disconnected from Redis");
  }
}
