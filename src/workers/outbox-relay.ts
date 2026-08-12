import "server-only";

import { connectToDatabase } from "@/lib/db";
import { OutboxEventModel, type OutboxEvent } from "@/models/OutboxEvent";
import { eventHandlerRegistry } from "@/workers/event-handlers/registry";
import { env } from "@/lib/env";

type WorkerConfig = {
  pollIntervalMs: number;
  maxRetries: number;
  maxRetryDelayMs: number;
};

class OutboxRelay {
  private isRunning = false;
  private pollTimer: NodeJS.Timer | null = null;
  private config: WorkerConfig;

  constructor(config?: Partial<WorkerConfig>) {
    const pollIntervalMs = parseInt(env.OUTBOX_POLL_INTERVAL_MS || "5000");
    const maxRetries = parseInt(env.OUTBOX_MAX_RETRIES || "5");
    const maxRetryDelayMs = parseInt(env.OUTBOX_MAX_RETRY_DELAY_MS || "300000");

    this.config = {
      pollIntervalMs: config?.pollIntervalMs ?? pollIntervalMs,
      maxRetries: config?.maxRetries ?? maxRetries,
      maxRetryDelayMs: config?.maxRetryDelayMs ?? maxRetryDelayMs
    };
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn("[Outbox Worker] Already running");
      return;
    }

    console.log("[Outbox Worker] Starting outbox relay worker");
    console.log(`[Outbox Worker] Config: pollIntervalMs=${this.config.pollIntervalMs}, maxRetries=${this.config.maxRetries}`);

    this.isRunning = true;

    await connectToDatabase();

    this.poll();
  }

  async stop(): Promise<void> {
    console.log("[Outbox Worker] Stopping outbox relay worker");
    this.isRunning = false;

    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private poll(): void {
    if (!this.isRunning) {
      return;
    }

    this.pollTimer = setTimeout(async () => {
      try {
        await this.processPendingEvents();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[Outbox Worker] Unexpected error in poll loop: ${errorMessage}`);
      } finally {
        this.poll();
      }
    }, this.config.pollIntervalMs);
  }

  private async processPendingEvents(): Promise<void> {
    try {
      const event = await OutboxEventModel.findOneAndUpdate(
        {
          status: "PENDING",
          scheduledAt: { $lte: new Date() }
        },
        {
          $set: { status: "PROCESSING", updatedAt: new Date() }
        },
        { new: true }
      );

      if (!event) {
        return;
      }

      await this.handleEvent(event as OutboxEvent);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Outbox Worker] Error processing pending events: ${errorMessage}`);
    }
  }

  private async handleEvent(event: OutboxEvent): Promise<void> {
    try {
      console.log(`[Outbox Worker] Processing event ${event._id}: ${event.eventType}`);

      const startTime = Date.now();

      try {
        await eventHandlerRegistry.handle(event);

        const latencyMs = Date.now() - startTime;

        await OutboxEventModel.findByIdAndUpdate(event._id, {
          $set: {
            status: "COMPLETED",
            processedAt: new Date(),
            updatedAt: new Date()
          }
        });

        console.log(`[Outbox Worker] Event ${event._id} completed in ${latencyMs}ms`);
      } catch (handlerError) {
        const errorMessage = handlerError instanceof Error ? handlerError.message : String(handlerError);
        console.warn(`[Outbox Worker] Handler failed for event ${event._id}: ${errorMessage}`);

        await this.handleRetry(event, errorMessage);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Outbox Worker] Critical error handling event ${event._id}: ${errorMessage}`);

      try {
        await OutboxEventModel.findByIdAndUpdate(event._id, {
          $set: {
            status: "PENDING",
            updatedAt: new Date()
          }
        });
      } catch (_) {
        console.error(`[Outbox Worker] Failed to reset event status, manual intervention may be required`);
      }
    }
  }

  private async handleRetry(event: OutboxEvent, error: string): Promise<void> {
    const nextRetryCount = event.retryCount + 1;

    if (nextRetryCount >= this.config.maxRetries) {
      console.error(`[Outbox Worker] Event ${event._id} max retries exceeded (${this.config.maxRetries}), marking as FAILED`);

      await OutboxEventModel.findByIdAndUpdate(event._id, {
        $set: {
          status: "FAILED",
          retryCount: nextRetryCount,
          error,
          processedAt: new Date(),
          updatedAt: new Date()
        }
      });

      return;
    }

    const delay = Math.min(Math.pow(2, nextRetryCount) * 1000, this.config.maxRetryDelayMs);
    const nextScheduledAt = new Date(Date.now() + delay);

    console.log(`[Outbox Worker] Event ${event._id} will retry in ${delay}ms (attempt ${nextRetryCount}/${this.config.maxRetries})`);

    await OutboxEventModel.findByIdAndUpdate(event._id, {
      $set: {
        status: "PENDING",
        retryCount: nextRetryCount,
        error,
        scheduledAt: nextScheduledAt,
        updatedAt: new Date()
      }
    });
  }
}

export const outboxRelay = new OutboxRelay();
