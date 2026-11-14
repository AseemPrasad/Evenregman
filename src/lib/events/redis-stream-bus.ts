import "server-only";

import { getRedisClient } from "@/lib/redis-client";
import { toCloudEvent, type CloudEventEnvelope } from "./cloud-events";
import type { DomainEvent } from "./types";
import type { OutboxEvent } from "@/models/OutboxEvent";

const STREAM_KEY = process.env.REDIS_STREAM_KEY || "mesh:events:stream";
const CONSUMER_GROUP = process.env.REDIS_STREAM_GROUP || "mesh:workers:group";

/**
 * High-Throughput Redis Streams Transport Bus (50,000 - 100,000+ ops/sec)
 * Uses XADD and XREADGROUP for partitioned, parallel consumer processing.
 */
export class RedisStreamBus {
  /**
   * Publishes an event to the Redis Stream as a CloudEvent.
   */
  async publish(event: OutboxEvent | DomainEvent): Promise<string | null> {
    try {
      const redis = getRedisClient();
      const cloudEvent = toCloudEvent(event);

      const messageId = await redis.xadd(
        STREAM_KEY,
        "*", // Auto-generate timestamp-sequence ID
        "id", cloudEvent.id,
        "type", cloudEvent.type,
        "source", cloudEvent.source,
        "time", cloudEvent.time,
        "data", JSON.stringify(cloudEvent.data)
      );

      return messageId;
    } catch (err) {
      console.error("[RedisStreamBus] Failed to publish event to stream:", err);
      return null;
    }
  }

  /**
   * Initializes consumer group if it does not already exist.
   */
  async ensureConsumerGroup(): Promise<void> {
    try {
      const redis = getRedisClient();
      // MKSTREAM creates the stream if it does not exist
      await redis.xgroup("CREATE", STREAM_KEY, CONSUMER_GROUP, "$", "MKSTREAM");
      console.log(`[RedisStreamBus] Created consumer group: ${CONSUMER_GROUP}`);
    } catch (err: any) {
      // BUSYGROUP means the group already exists, which is expected and safe
      if (!err?.message?.includes("BUSYGROUP")) {
        console.error("[RedisStreamBus] Error creating consumer group:", err);
      }
    }
  }

  /**
   * Polls messages for a specific consumer in the consumer group.
   */
  async readMessages(
    consumerId: string,
    count = 50,
    blockMs = 2000
  ): Promise<Array<{ id: string; event: CloudEventEnvelope }>> {
    try {
      const redis = getRedisClient();

      // Read new messages assigned to this consumer
      const response = (await redis.xreadgroup(
        "GROUP",
        CONSUMER_GROUP,
        consumerId,
        "COUNT",
        count,
        "BLOCK",
        blockMs,
        "STREAMS",
        STREAM_KEY,
        ">"
      )) as any;

      if (!response || !Array.isArray(response) || response.length === 0) {
        return [];
      }

      const streamEntries = response[0][1];
      const parsed: Array<{ id: string; event: CloudEventEnvelope }> = [];

      for (const [msgId, fields] of streamEntries) {
        const fieldMap: Record<string, string> = {};
        for (let i = 0; i < fields.length; i += 2) {
          fieldMap[fields[i]] = fields[i + 1];
        }

        parsed.push({
          id: msgId,
          event: {
            specversion: "1.0",
            id: fieldMap.id,
            source: fieldMap.source,
            type: fieldMap.type,
            time: fieldMap.time,
            datacontenttype: "application/json",
            data: fieldMap.data ? JSON.parse(fieldMap.data) : {}
          }
        });
      }

      return parsed;
    } catch (err) {
      console.error("[RedisStreamBus] Error reading from stream:", err);
      return [];
    }
  }

  /**
   * Acknowledges that a message was successfully processed.
   */
  async acknowledge(messageId: string): Promise<void> {
    try {
      const redis = getRedisClient();
      await redis.xack(STREAM_KEY, CONSUMER_GROUP, messageId);
    } catch (err) {
      console.error(`[RedisStreamBus] Error acknowledging message ${messageId}:`, err);
    }
  }
}

export const redisStreamBus = new RedisStreamBus();

