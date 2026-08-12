import "server-only";

import { model, models, Schema, type Model, type Types } from "mongoose";
import { env } from "@/lib/env";

export const AUDIT_ACTIONS = [
  "CREATE",
  "UPDATE",
  "DELETE",
  "VIEW_SENSITIVE",
  "PERMISSION_DENIED",
  "LOGIN",
  "LOGOUT"
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_TARGET_TYPES = [
  "Event",
  "User",
  "Membership",
  "Organization",
  "Registration",
  "CustomEvent"
] as const;
export type AuditTargetType = (typeof AUDIT_TARGET_TYPES)[number];

export interface AuditLog {
  _id: Types.ObjectId;
  actorId?: Types.ObjectId;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId: string;
  targetOrgId: Types.ObjectId;
  before?: Record<string, any>;
  after?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  context?: Record<string, any>;
  timestamp: Date;
  createdAt: Date;
}

export interface AuditLogModel extends Model<AuditLog> {
  findOrgLogs(
    orgId: Types.ObjectId,
    options?: { action?: string; targetType?: string; limit?: number; skip?: number }
  ): Promise<AuditLog[]>;
}

const auditLogSchema = new Schema<AuditLog, AuditLogModel>(
  {
    actorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      sparse: true,
      index: true
    },
    action: {
      type: String,
      enum: {
        values: AUDIT_ACTIONS,
        message: "Invalid audit action"
      },
      required: true,
      index: true
    },
    targetType: {
      type: String,
      enum: {
        values: AUDIT_TARGET_TYPES,
        message: "Invalid target type"
      },
      required: true,
      index: true
    },
    targetId: {
      type: String,
      required: true,
      index: true
    },
    targetOrgId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true
    },
    before: {
      type: Schema.Types.Mixed,
      sparse: true
    },
    after: {
      type: Schema.Types.Mixed,
      sparse: true
    },
    ipAddress: {
      type: String,
      sparse: true
    },
    userAgent: {
      type: String,
      sparse: true
    },
    context: {
      type: Schema.Types.Mixed,
      default: {}
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: false
  }
);

auditLogSchema.index({ targetOrgId: 1, timestamp: -1 });
auditLogSchema.index({ actorId: 1, timestamp: -1 });
auditLogSchema.index({ targetType: 1, targetId: 1 });

const retentionDays = parseInt(env.RBAC_AUDIT_RETENTION_DAYS || "2555", 10);
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: retentionDays * 86400 });

auditLogSchema.static("findOrgLogs", async function (
  orgId: Types.ObjectId,
  options?: { action?: string; targetType?: string; limit?: number; skip?: number }
) {
  const query: any = { targetOrgId: orgId };

  if (options?.action) {
    query.action = options.action;
  }
  if (options?.targetType) {
    query.targetType = options.targetType;
  }

  return this.find(query)
    .sort({ timestamp: -1 })
    .limit(options?.limit || 50)
    .skip(options?.skip || 0);
});

export const AuditLogModel: AuditLogModel =
  models.AuditLog || model<AuditLog, AuditLogModel>("AuditLog", auditLogSchema);
