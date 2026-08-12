import "server-only";

import type { OutboxEvent } from "@/models/OutboxEvent";

export interface EventHandler {
  readonly eventType: string;
  handle(event: OutboxEvent): Promise<void>;
}

export class HandlerError extends Error {
  constructor(message: string, public readonly eventId: string, public readonly eventType: string) {
    super(message);
    this.name = "HandlerError";
  }
}
