import "server-only";

import { revalidateTag, revalidatePath } from "next/cache";
import { invalidateCache, invalidateCachePattern } from "@/lib/cache-service";
import { CACHE_KEYS, CACHE_TAGS } from "@/lib/cache-config";
import { env } from "@/lib/env";

export async function revalidateEventCache(slug: string): Promise<void> {
  try {
    const cacheKey = CACHE_KEYS.EVENT_BY_SLUG(slug);
    const cacheTag = CACHE_TAGS.EVENT(slug);

    if (env.ENABLE_L2_CACHE === "true") {
      await invalidateCache(cacheKey);
    }

    revalidateTag(cacheTag);
    revalidateTag(CACHE_TAGS.EVENTS);

    console.log(`[Cache] Revalidated event cache for slug: ${slug}`);
  } catch (err) {
    console.error("[Cache] Error revalidating event cache:", err);
  }
}

export async function revalidateEventsList(): Promise<void> {
  try {
    const cacheKey = CACHE_KEYS.EVENTS_LIST();

    if (env.ENABLE_L2_CACHE === "true") {
      await invalidateCache(cacheKey);
    }

    revalidateTag(CACHE_TAGS.EVENTS);
    revalidatePath("/events");

    console.log("[Cache] Revalidated events list cache");
  } catch (err) {
    console.error("[Cache] Error revalidating events list:", err);
  }
}

export async function revalidateOrgEvents(orgId: string): Promise<void> {
  try {
    const cacheKey = CACHE_KEYS.EVENTS_BY_ORG(orgId);
    const cacheTag = CACHE_TAGS.ORG(orgId);

    if (env.ENABLE_L2_CACHE === "true") {
      await invalidateCache(cacheKey);
    }

    revalidateTag(cacheTag);
    revalidateTag(CACHE_TAGS.EVENTS);

    console.log(`[Cache] Revalidated org events cache for org: ${orgId}`);
  } catch (err) {
    console.error("[Cache] Error revalidating org events:", err);
  }
}

export async function revalidateAllEventCaches(): Promise<void> {
  try {
    if (env.ENABLE_L2_CACHE === "true") {
      await invalidateCachePattern("cache:event:*");
      await invalidateCachePattern("cache:events:*");
    }

    revalidateTag(CACHE_TAGS.EVENTS);
    revalidatePath("/events");

    console.log("[Cache] Revalidated all event caches");
  } catch (err) {
    console.error("[Cache] Error revalidating all event caches:", err);
  }
}

export async function revalidateRegistrationCache(registrationId: string): Promise<void> {
  try {
    const cacheKey = CACHE_KEYS.REGISTRATION(registrationId);

    if (env.ENABLE_L2_CACHE === "true") {
      await invalidateCache(cacheKey);
    }

    console.log(`[Cache] Revalidated registration cache for: ${registrationId}`);
  } catch (err) {
    console.error("[Cache] Error revalidating registration cache:", err);
  }
}

export async function revalidateEventRegistrations(eventId: string): Promise<void> {
  try {
    const cacheKey = CACHE_KEYS.EVENT_REGISTRATIONS(eventId);

    if (env.ENABLE_L2_CACHE === "true") {
      await invalidateCache(cacheKey);
    }

    console.log(`[Cache] Revalidated event registrations cache for event: ${eventId}`);
  } catch (err) {
    console.error("[Cache] Error revalidating event registrations:", err);
  }
}
