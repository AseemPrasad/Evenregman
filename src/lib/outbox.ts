import "server-only";

import mongoose from "mongoose";
import { OutboxEventModel, type OutboxAggregateType, type OutboxEvent } from "@/models/OutboxEvent";
import { env } from "@/lib/env";

type PublishEventInput = {
  aggregateType: OutboxAggregateType;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  scheduledAt?: Date;
};

type PublishEventsInput = PublishEventInput[];

type PublishResult = {
  success: boolean;
  eventId?: string;
  error?: string;
};

type PublishBatchResult = {
  success: boolean;
  eventIds: string[];
  errors: string[];
};

class OutboxPublisher {
  private isEnabled(): boolean {
    return env.ENABLE_OUTBOX_PATTERN === "true";
  }

  async publishEvent(
    session: any,
    aggregateType: OutboxAggregateType,
    aggregateId: string,
    eventType: string,
    payload: Record<string, unknown>,
    scheduledAt?: Date
  ): Promise<PublishResult> {
    if (!this.isEnabled()) {
      return { success: true };
    }

    try {
      if (!session) {
        return { success: false, error: "Session is required for outbox event publication" };
      }

      const now = new Date();
      const eventScheduledAt = scheduledAt ?? now;

      const [createdEvent] = await OutboxEventModel.create(
        [
          {
            aggregateType,
            aggregateId,
            eventType,
            payload,
            status: "PENDING",
            retryCount: 0,
            scheduledAt: eventScheduledAt,
            processedAt: null,
            error: null
          }
        ],
        { session }
      );

      return { success: true, eventId: createdEvent._id.toString() };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(`[Outbox] Failed to publish event ${eventType} for ${aggregateType}:${aggregateId}: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  async publishEventsInBatch(
    session: any,
    events: PublishEventsInput
  ): Promise<PublishBatchResult> {
    if (!this.isEnabled()) {
      return { success: true, eventIds: [], errors: [] };
    }

    try {
      if (!session) {
        return { success: false, eventIds: [], errors: ["Session is required for outbox event publication"] };
      }

      if (events.length === 0) {
        return { success: true, eventIds: [], errors: [] };
      }

      const now = new Date();
      const eventDocuments = events.map((event) => ({
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        eventType: event.eventType,
        payload: event.payload,
        status: "PENDING",
        retryCount: 0,
        scheduledAt: event.scheduledAt ?? now,
        processedAt: null,
        error: null
      }));

      const createdEvents = await OutboxEventModel.create(eventDocuments, { session });

      const eventIds = createdEvents.map((event) => event._id.toString());
      return { success: true, eventIds, errors: [] };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(`[Outbox] Failed to publish batch of ${events.length} events: ${errorMessage}`);
      return { success: false, eventIds: [], errors: [errorMessage] };
    }
  }

  async publishEventOutOfTransaction(
    aggregateType: OutboxAggregateType,
    aggregateId: string,
    eventType: string,
    payload: Record<string, unknown>,
    scheduledAt?: Date
  ): Promise<PublishResult> {
    if (!this.isEnabled()) {
      return { success: true };
    }

    try {
      const now = new Date();
      const eventScheduledAt = scheduledAt ?? now;

      const createdEvent = await OutboxEventModel.create({
        aggregateType,
        aggregateId,
        eventType,
        payload,
        status: "PENDING",
        retryCount: 0,
        scheduledAt: eventScheduledAt,
        processedAt: null,
        error: null
      });

      return { success: true, eventId: createdEvent._id.toString() };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(`[Outbox] Failed to publish event ${eventType} for ${aggregateType}:${aggregateId}: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }
}

export const outboxPublisher = new OutboxPublisher();
