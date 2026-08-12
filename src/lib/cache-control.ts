import "server-only";

import { env } from "@/lib/env";
import { headers } from "next/headers";

export function isCacheEnabled(): boolean {
  return env.ENABLE_L2_CACHE === "true";
}

export function shouldBypassCache(req?: Request | Headers): boolean {
  const headerList = req instanceof Headers ? req : req?.headers ?? new Headers();

  const cacheControl = headerList.get("cache-control") || "";
  const xCacheControl = headerList.get("x-cache-control") || "";

  if (cacheControl.includes("no-cache") || cacheControl.includes("no-store")) {
    return true;
  }

  if (xCacheControl === "bypass" || xCacheControl === "no-cache") {
    return true;
  }

  return false;
}

export function getCacheDebugHeaders(isCacheHit: boolean, cacheKey: string, ttlSeconds: number) {
  return {
    "X-Cache-Status": isCacheHit ? "HIT" : "MISS",
    "X-Cache-Key": cacheKey,
    "X-Cache-TTL": ttlSeconds.toString(),
    "Cache-Control": isCacheHit ? "public, max-age=300" : "public, max-age=60"
  };
}

export function logCacheOperation(
  operation: "HIT" | "MISS" | "WRITE" | "DELETE" | "ERROR",
  cacheKey: string,
  details?: any
): void {
  if (env.NODE_ENV === "production") {
    return;
  }

  const timestamp = new Date().toISOString();
  console.log(`[Cache] ${timestamp} ${operation} ${cacheKey}`, details || "");
}

export interface CacheHints {
  strategy: "read-through" | "write-through" | "bypass";
  ttl: number;
  compress: boolean;
}

export function getCacheHints(resourceType: "event" | "events-list" | "registration"): CacheHints {
  switch (resourceType) {
    case "event":
      return {
        strategy: "read-through",
        ttl: parseInt(env.CACHE_TTL_EVENTS, 10),
        compress: env.CACHE_COMPRESSION_ENABLED === "true"
      };
    case "events-list":
      return {
        strategy: "read-through",
        ttl: parseInt(env.CACHE_TTL_EVENTS_LIST, 10),
        compress: env.CACHE_COMPRESSION_ENABLED === "true"
      };
    case "registration":
      return {
        strategy: "read-through",
        ttl: 600,
        compress: false
      };
    default:
      return {
        strategy: "bypass",
        ttl: 0,
        compress: false
      };
  }
}

export function validateCacheTTL(ttlSeconds: number): number {
  const MIN_TTL = 60;
  const MAX_TTL = 86400;

  if (ttlSeconds < MIN_TTL) {
    return MIN_TTL;
  }

  if (ttlSeconds > MAX_TTL) {
    return MAX_TTL;
  }

  return ttlSeconds;
}

export function getCacheKeyFromRequest(resourceType: string, resourceId: string): string {
  return `cache:${resourceType}:${resourceId}`;
}
