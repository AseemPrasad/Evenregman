import "server-only";

import mongoose from "mongoose";
import type { OutboxEvent } from "@/models/OutboxEvent";
import { BaseEventHandler } from "@/workers/event-handlers/base";
import { AuditLogModel } from "@/models/AuditLog";

export class LeaseAllocatedHandler extends BaseEventHandler {
  readonly eventType = "lease.allocated";

  async process(event: OutboxEvent): Promise<void> {
    const payload = event.payload as {
      leaseId?: string;
      resourceId?: string;
      resourceTitle?: string;
      resourceType?: string;
      userId?: string;
      expiresAt?: string;
      leaseToken?: string;
    };

    console.log(
      `[ResMesh Outbox] ⚡ Lease Allocated: Resource "${payload.resourceTitle}" (${payload.resourceType}) locked until ${payload.expiresAt}`
    );

    // Persist to AuditLog collection for live telemetry & enterprise compliance
    try {
      await AuditLogModel.create({
        action: "CREATE",
        targetType: "CustomEvent",
        targetId: payload.leaseId || (event as any)._id?.toString() || "unknown",
        actorId: payload.userId && mongoose.isValidObjectId(payload.userId) ? new mongoose.Types.ObjectId(payload.userId) : undefined,
        context: {
          resourceTitle: payload.resourceTitle,
          resourceType: payload.resourceType,
          expiresAt: payload.expiresAt,
          leaseToken: payload.leaseToken
        },
        timestamp: new Date()
      });
    } catch (auditErr) {
      console.error("[ResMesh Outbox] Failed to write audit log entry:", auditErr);
    }
  }
}

export const leaseAllocatedHandler = new LeaseAllocatedHandler();

