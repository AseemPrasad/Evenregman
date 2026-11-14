import "server-only";

import type { OutboxEvent } from "@/models/OutboxEvent";
import type { DomainEvent } from "@/lib/events/types";

export interface EventHandler {
  readonly eventType: string;
  handle(event: OutboxEvent | DomainEvent): Promise<void>;
}

export class HandlerError extends Error {
  constructor(message: string, public readonly eventId: string, public readonly eventType: string) {
    super(message);
    this.name = "HandlerError";
  }
}

export abstract class BaseEventHandler implements EventHandler {
  abstract readonly eventType: string;

  async handle(event: OutboxEvent | DomainEvent): Promise<void> {
    const eventId = "id" in event && typeof event.id === "string" ? event.id : (event as any)._id?.toString() || "unknown";
    try {
      await this.process(event);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new HandlerError(message, eventId, this.eventType);
    }
  }

  abstract process(event: OutboxEvent | DomainEvent): Promise<void>;
}

