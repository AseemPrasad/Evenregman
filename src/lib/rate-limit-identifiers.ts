import "server-only";

import { NextRequest } from "next/server";
import type { IdentifierType } from "@/lib/rate-limit-config";

export function extractClientIP(request: NextRequest): string {
  let ip =
    (request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip")) ??
    request.ip ??
    "unknown";

  // For localhost development
  if (ip === "::1" || ip === "127.0.0.1") {
    ip = "localhost";
  }

  return ip;
}

export function formatIPIdentifier(ip: string): string {
  return `ip:${ip}`;
}

export function formatUserIdentifier(userId: string): string {
  return `user:${userId}`;
}

export function formatEmailIdentifier(email: string): string {
  return `email:${email.toLowerCase()}`;
}

export function formatCompositeIdentifier(ip: string, userId?: string): string {
  if (userId) {
    return `composite:${ip}:${userId}`;
  }
  return `composite:${ip}`;
}

export function resolveIdentifier(
  identifierType: IdentifierType,
  ip: string,
  userId?: string,
  email?: string
): string {
  switch (identifierType) {
    case "ip":
      return formatIPIdentifier(ip);
    case "user":
      if (!userId) {
        return formatIPIdentifier(ip);
      }
      return formatUserIdentifier(userId);
    case "email":
      if (!email) {
        return formatIPIdentifier(ip);
      }
      return formatEmailIdentifier(email);
    case "composite":
      return formatCompositeIdentifier(ip, userId);
    default:
      return formatIPIdentifier(ip);
  }
}
