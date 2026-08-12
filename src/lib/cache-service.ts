import "server-only";

import { cacheGet, cacheSet, cacheDel, cacheDelPattern } from "@/lib/redis-cache";
import { env } from "@/lib/env";

export interface CacheOptions {
  compress?: boolean;
  serialize?: boolean;
}

let cacheStats = {
  hits: 0,
  misses: 0,
  writes: 0,
  deletes: 0,
  errors: 0
};

export async function getCachedOrQuery<T>(
  cacheKey: string,
  ttlSeconds: number,
  queryFn: () => Promise<T>,
  options?: CacheOptions
): Promise<T> {
  if (env.ENABLE_L2_CACHE !== "true") {
    return queryFn();
  }

  try {
    const cached = await cacheGet<T>(cacheKey);

    if (cached !== null) {
      cacheStats.hits++;
      return cached;
    }

    cacheStats.misses++;

    const data = await queryFn();

    if (data !== null && data !== undefined) {
      await cacheSet(cacheKey, data, ttlSeconds);
      cacheStats.writes++;
    }

    return data;
  } catch (err) {
    console.error("[CacheService] Error in getCachedOrQuery:", err);
    cacheStats.errors++;
    return queryFn();
  }
}

export async function invalidateCache(key: string): Promise<void> {
  if (env.ENABLE_L2_CACHE !== "true") {
    return;
  }

  try {
    await cacheDel(key);
    cacheStats.deletes++;
  } catch (err) {
    console.error("[CacheService] Error invalidating cache:", err);
    cacheStats.errors++;
  }
}

export async function invalidateCachePattern(pattern: string): Promise<number> {
  if (env.ENABLE_L2_CACHE !== "true") {
    return 0;
  }

  try {
    const deleted = await cacheDelPattern(pattern);
    if (deleted > 0) {
      cacheStats.deletes += deleted;
    }
    return deleted;
  } catch (err) {
    console.error("[CacheService] Error invalidating cache pattern:", err);
    cacheStats.errors++;
    return 0;
  }
}

export async function invalidateCacheTag(tag: string): Promise<number> {
  if (env.ENABLE_L2_CACHE !== "true") {
    return 0;
  }

  try {
    const pattern = `cache:*${tag}*`;
    return await invalidateCachePattern(pattern);
  } catch (err) {
    console.error("[CacheService] Error invalidating cache tag:", err);
    cacheStats.errors++;
    return 0;
  }
}

export function getCacheStats() {
  const total = cacheStats.hits + cacheStats.misses;
  const hitRate = total > 0 ? (cacheStats.hits / total) * 100 : 0;

  return {
    hits: cacheStats.hits,
    misses: cacheStats.misses,
    writes: cacheStats.writes,
    deletes: cacheStats.deletes,
    errors: cacheStats.errors,
    hitRate: Math.round(hitRate * 100) / 100,
    total
  };
}

export function resetCacheStats(): void {
  cacheStats = {
    hits: 0,
    misses: 0,
    writes: 0,
    deletes: 0,
    errors: 0
  };
}

export async function warmCache<T>(
  cacheKey: string,
  ttlSeconds: number,
  queryFn: () => Promise<T>
): Promise<void> {
  if (env.ENABLE_L2_CACHE !== "true") {
    return;
  }

  try {
    const data = await queryFn();
    if (data !== null && data !== undefined) {
      await cacheSet(cacheKey, data, ttlSeconds);
      cacheStats.writes++;
    }
  } catch (err) {
    console.error("[CacheService] Error warming cache:", err);
    cacheStats.errors++;
  }
}

export class RequestCacheContext {
  private cache = new Map<string, any>();

  get<T>(key: string): T | undefined {
    return this.cache.get(key);
  }

  set<T>(key: string, value: T): void {
    this.cache.set(key, value);
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  clear(): void {
    this.cache.clear();
  }
}
