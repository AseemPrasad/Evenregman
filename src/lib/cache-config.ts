import "server-only";

import { env } from "@/lib/env";

export const CACHE_KEYS = {
  EVENT_BY_SLUG: (slug: string) => `cache:event:${slug}`,
  EVENTS_LIST: () => `cache:events:list`,
  EVENTS_BY_ORG: (orgId: string) => `cache:events:org:${orgId}`,
  REGISTRATION: (id: string) => `cache:registration:${id}`,
  EVENT_REGISTRATIONS: (eventId: string) => `cache:event:${eventId}:registrations`
};

export const CACHE_TAGS = {
  EVENTS: "events",
  EVENT: (slug: string) => `event:${slug}`,
  ORG: (orgId: string) => `org:${orgId}`
};

export interface CacheTTLConfig {
  events: number;
  eventsList: number;
  eventsByOrg: number;
  registrations: number;
}

export function getCacheTTLConfig(): CacheTTLConfig {
  return {
    events: parseInt(env.CACHE_TTL_EVENTS, 10),
    eventsList: parseInt(env.CACHE_TTL_EVENTS_LIST, 10),
    eventsByOrg: 1800,
    registrations: 600
  };
}

export interface CacheCompressionConfig {
  enabled: boolean;
  thresholdBytes: number;
}

export function getCacheCompressionConfig(): CacheCompressionConfig {
  return {
    enabled: env.CACHE_COMPRESSION_ENABLED === "true",
    thresholdBytes: parseInt(env.CACHE_COMPRESSION_THRESHOLD_BYTES, 10)
  };
}

export function isCacheEnabled(): boolean {
  return env.ENABLE_L2_CACHE === "true";
}
