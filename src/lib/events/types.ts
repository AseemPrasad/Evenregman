import "server-only";

/**
 * Universal, transport-agnostic Domain Event interface.
 * Decouples business logic handlers from underlying persistence layers
 * (MongoDB Outbox, Redis Streams, Apache Kafka, AWS EventBridge, etc.).
 */
export interface DomainEvent<T = Record<string, unknown>> {
  id: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: T;
  occurredAt: Date;
  source?: string;
  traceId?: string;
}

