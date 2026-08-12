import "server-only";

import type { Session } from "next-auth";

export interface AuditContext {
  ipAddress?: string;
  userAgent?: string;
  userId?: string;
  requestId?: string;
  source?: string;
}

export function extractIpAddress(req: Request): string | undefined {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  const realIp = req.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }

  const cfIp = req.headers.get("cf-connecting-ip");
  if (cfIp) {
    return cfIp;
  }

  return undefined;
}

export function extractUserAgent(req: Request): string | undefined {
  return req.headers.get("user-agent") || undefined;
}

export function createAuditContext(req: Request, session?: Session): AuditContext {
  return {
    ipAddress: extractIpAddress(req),
    userAgent: extractUserAgent(req),
    userId: session?.user?.id,
    requestId: req.headers.get("x-request-id") || undefined,
    source: "web"
  };
}

export function captureAuditContext(ipAddress?: string, userAgent?: string, userId?: string): AuditContext {
  return {
    ipAddress,
    userAgent,
    userId,
    source: "api"
  };
}
