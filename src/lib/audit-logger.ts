import "server-only";

import { AuditLogModel, type AuditAction, type AuditTargetType } from "@/models/AuditLog";
import { env } from "@/lib/env";
import type { Types } from "mongoose";

export interface AuditEventData {
  actorId?: Types.ObjectId | string;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId: string | Types.ObjectId;
  targetOrgId: Types.ObjectId | string;
  before?: Record<string, any>;
  after?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  context?: Record<string, any>;
}

const SENSITIVE_FIELDS = ["password", "token", "secret", "apiKey", "accessToken", "refreshToken"];

function redactSensitiveFields(obj: any): any {
  if (!obj || typeof obj !== "object") {
    return obj;
  }

  const redacted = Array.isArray(obj) ? [...obj] : { ...obj };

  for (const key in redacted) {
    const lowerKey = key.toLowerCase();

    if (SENSITIVE_FIELDS.some((field) => lowerKey.includes(field))) {
      redacted[key] = "[REDACTED]";
    } else if (typeof redacted[key] === "object") {
      redacted[key] = redactSensitiveFields(redacted[key]);
    }
  }

  return redacted;
}

export async function logAuditEvent(data: AuditEventData): Promise<void> {
  if (env.ENABLE_RBAC_ENGINE !== "true") {
    return;
  }

  try {
    const auditEntry = {
      actorId: data.actorId,
      action: data.action,
      targetType: data.targetType,
      targetId: data.targetId.toString(),
      targetOrgId: data.targetOrgId,
      before: data.before ? redactSensitiveFields(data.before) : undefined,
      after: data.after ? redactSensitiveFields(data.after) : undefined,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      context: data.context || {},
      timestamp: new Date()
    };

    await AuditLogModel.create(auditEntry);
  } catch (err) {
    console.error("[AuditLogger] Error writing audit log:", err);
  }
}

export async function logAuditEventAsync(data: AuditEventData): Promise<void> {
  if (env.ENABLE_RBAC_ENGINE !== "true") {
    return;
  }

  setImmediate(async () => {
    try {
      await logAuditEvent(data);
    } catch (err) {
      console.error("[AuditLogger] Error in async audit logging:", err);
    }
  });
}

export async function getOrgAuditLogs(
  orgId: Types.ObjectId | string,
  options?: {
    action?: string;
    targetType?: string;
    actorId?: string;
    limit?: number;
    skip?: number;
  }
): Promise<any[]> {
  try {
    const logs = await AuditLogModel.findOrgLogs(orgId, {
      action: options?.action,
      targetType: options?.targetType,
      limit: options?.limit || 50,
      skip: options?.skip || 0
    });
    return logs;
  } catch (err) {
    console.error("[AuditLogger] Error fetching audit logs:", err);
    return [];
  }
}

export async function countOrgAuditLogs(orgId: Types.ObjectId | string): Promise<number> {
  try {
    const count = await AuditLogModel.countDocuments({ targetOrgId: orgId });
    return count;
  } catch (err) {
    console.error("[AuditLogger] Error counting audit logs:", err);
    return 0;
  }
}
