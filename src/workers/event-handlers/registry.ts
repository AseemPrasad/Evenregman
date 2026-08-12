import "server-only";

import type { OutboxEvent } from "@/models/OutboxEvent";
import type { EventHandler } from "@/workers/event-handlers/base";
import { registrationCreatedHandler } from "@/workers/event-handlers/registration-created";

class EventHandlerRegistry {
  private handlers: Map<string, EventHandler> = new Map();

  constructor() {
    this.registerHandlers();
  }

  private registerHandlers(): void {
    this.register(registrationCreatedHandler);
  }

  register(handler: EventHandler): void {
    if (this.handlers.has(handler.eventType)) {
      console.warn(`[Event Handler Registry] Handler for ${handler.eventType} already registered, overwriting`);
    }
    this.handlers.set(handler.eventType, handler);
    console.log(`[Event Handler Registry] Registered handler for ${handler.eventType}`);
  }

  async handle(event: OutboxEvent): Promise<void> {
    const handler = this.handlers.get(event.eventType);

    if (!handler) {
      console.warn(`[Event Handler Registry] No handler registered for event type: ${event.eventType}`);
      throw new Error(`No handler registered for event type: ${event.eventType}`);
    }

    await handler.handle(event);
  }

  getHandledEventTypes(): string[] {
    return Array.from(this.handlers.keys());
  }

  hasHandler(eventType: string): boolean {
    return this.handlers.has(eventType);
  }
}

export const eventHandlerRegistry = new EventHandlerRegistry();
