import "server-only";

import { env } from "@/lib/env";
import type { Types } from "mongoose";

let revokedTokens = new Map<string, number>();

export async function revokeUserSessions(
  userId: Types.ObjectId | string,
  orgId?: Types.ObjectId | string
): Promise<void> {
  if (env.SESSION_REVOCATION_ENABLED !== "true") {
    return;
  }

  try {
    const revokeKey = `${userId}:${orgId || "*"}`;
    const revokeTime = Math.floor(Date.now() / 1000);
    revokedTokens.set(revokeKey, revokeTime);

    console.log(`[SessionMgmt] Revoked sessions for user ${userId} in org ${orgId || "all"}`);
  } catch (err) {
    console.error("[SessionMgmt] Error revoking sessions:", err);
  }
}

export function isTokenRevoked(
  userId: Types.ObjectId | string,
  orgId?: Types.ObjectId | string,
  issuedAt?: number
): boolean {
  if (env.SESSION_REVOCATION_ENABLED !== "true") {
    return false;
  }

  try {
    const revokeKey = `${userId}:${orgId || "*"}`;
    const revokeTime = revokedTokens.get(revokeKey);

    if (!revokeTime) {
      return false;
    }

    if (!issuedAt) {
      return true;
    }

    return issuedAt <= revokeTime;
  } catch (err) {
    console.error("[SessionMgmt] Error checking token revocation:", err);
    return false;
  }
}

export function clearExpiredRevocations(): void {
  if (env.SESSION_REVOCATION_ENABLED !== "true") {
    return;
  }

  try {
    const ttlSeconds = parseInt(env.SESSION_REVOCATION_TTL_HOURS, 10) * 3600;
    const cutoffTime = Math.floor(Date.now() / 1000) - ttlSeconds;

    let expiredCount = 0;
    for (const [key, revokeTime] of revokedTokens.entries()) {
      if (revokeTime < cutoffTime) {
        revokedTokens.delete(key);
        expiredCount++;
      }
    }

    if (expiredCount > 0) {
      console.log(`[SessionMgmt] Cleared ${expiredCount} expired token revocations`);
    }
  } catch (err) {
    console.error("[SessionMgmt] Error clearing expired revocations:", err);
  }
}

export function getRevokedTokenCount(): number {
  return revokedTokens.size;
}
