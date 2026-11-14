import "server-only";

import type { OutboxEvent } from "@/models/OutboxEvent";
import type { DomainEvent } from "./types";

/**
 * CNCF CloudEvents v1.0 Standard Envelope Specification.
 * Guarantees interoperability with Apache Kafka, Debezium, AWS EventBridge, Datadog, and GCP Pub/Sub.
 */
export interface CloudEventEnvelope<T = Record<string, unknown>> {
  specversion: "1.0";
  id: string;
  source: string;
  type: string;
  time: string;
  datacontenttype: "application/json";
  data: T;
  traceparent?: string;
}

/**
 * Transforms an OutboxEvent or DomainEvent into a standard CloudEvents v1.0 structure.
 */
export function toCloudEvent<T = Record<string, unknown>>(
  event: OutboxEvent | DomainEvent<T>,
  serviceSource = "/resmesh/control-plane"
): CloudEventEnvelope<T> {
  const eventId = "id" in event && typeof event.id === "string" ? event.id : (event as any)._id?.toString() || "";
  const eventType = event.eventType;
  const time = "occurredAt" in event && event.occurredAt instanceof Date
    ? event.occurredAt.toISOString()
    : "createdAt" in event && (event as any).createdAt instanceof Date
    ? (event as any).createdAt.toISOString()
    : new Date().toISOString();

  const payload = event.payload as T;

  return {
    specversion: "1.0",
    id: eventId,
    source: serviceSource,
    type: eventType.startsWith("mesh.") ? eventType : `mesh.${eventType.toLowerCase().replace(/_/g, ".")}`,
    time,
    datacontenttype: "application/json",
    data: payload
  };
}

