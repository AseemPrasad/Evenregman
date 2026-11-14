import "server-only";

import type { OutboxEvent } from "@/models/OutboxEvent";
import { BaseEventHandler } from "@/workers/event-handlers/base";

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

    // In production, this handler dispatches to Slack bots, AWS/K8s provisioning webhooks,
    // or Cloudflare Access policies to grant immediate infrastructure access.
  }
}

export const leaseAllocatedHandler = new LeaseAllocatedHandler();

