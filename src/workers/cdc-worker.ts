import "server-only";

import { connectToDatabase } from "@/lib/db";
import { env } from "@/lib/env";
import { DocumentChangeEvent } from "mongodb";

export interface CDCEventPayload {
  operationType: "insert" | "update" | "replace" | "delete";
  fullDocument?: any;
  documentKey?: any;
  updateDescription?: {
    updatedFields: Record<string, any>;
    removedFields: string[];
  };
  clusterTime?: any;
  resumeToken?: any;
  ns?: {
    db: string;
    coll: string;
  };
}

export type CDCEventHandler = (event: CDCEventPayload) => Promise<void>;

class CDCWorker {
  private isRunning = false;
  private changeStream: any = null;
  private handlers: Map<string, CDCEventHandler[]> = new Map();
  private errorRetryDelay: number;

  constructor() {
    this.errorRetryDelay = parseInt(env.CDC_ERROR_RETRY_DELAY_MS || "5000");
  }

  registerHandler(collectionName: string, handler: CDCEventHandler): void {
    if (!this.handlers.has(collectionName)) {
      this.handlers.set(collectionName, []);
    }
    this.handlers.get(collectionName)!.push(handler);
    console.log(`[CDCWorker] Handler registered for collection: ${collectionName}`);
  }

  async start(collectionName: string): Promise<void> {
    if (this.isRunning) {
      console.warn("[CDCWorker] Already running");
      return;
    }

    if (!env.ENABLE_CDC_PIPELINE) {
      console.warn("[CDCWorker] CDC pipeline disabled (ENABLE_CDC_PIPELINE=false)");
      return;
    }

    console.log("[CDCWorker] Starting CDC worker for collection:", collectionName);
    this.isRunning = true;

    await connectToDatabase();
    await this.watchCollection(collectionName);
  }

  async stop(): Promise<void> {
    console.log("[CDCWorker] Stopping CDC worker");
    this.isRunning = false;

    if (this.changeStream) {
      try {
        await this.changeStream.close();
      } catch (err) {
        console.error("[CDCWorker] Error closing change stream:", err);
      }
    }
  }

  private async watchCollection(collectionName: string): Promise<void> {
    try {
      const db = await connectToDatabase();
      const collection = db.collection(collectionName);

      this.changeStream = collection.watch([], {
        fullDocument: "updateLookup",
        resumeAfter: undefined,
      });

      console.log(`[CDCWorker] Change stream opened for ${collectionName}`);

      this.changeStream.on("change", async (change: CDCEventPayload) => {
        if (!this.isRunning) return;

        try {
          await this.handleChange(collectionName, change);
        } catch (err) {
          console.error(`[CDCWorker] Error processing change:`, err);
        }
      });

      this.changeStream.on("error", async (err: Error) => {
        console.error(`[CDCWorker] Change stream error:`, err);
        if (this.isRunning) {
          await this.reconnectWithBackoff(collectionName);
        }
      });

      this.changeStream.on("close", () => {
        console.warn("[CDCWorker] Change stream closed");
        if (this.isRunning) {
          this.watchCollection(collectionName).catch((err) =>
            console.error("[CDCWorker] Reconnection failed:", err),
          );
        }
      });
    } catch (err) {
      console.error("[CDCWorker] Error opening change stream:", err);
      if (this.isRunning) {
        await this.reconnectWithBackoff(collectionName);
      }
    }
  }

  private async handleChange(collectionName: string, change: CDCEventPayload): Promise<void> {
    const handlers = this.handlers.get(collectionName) || [];

    if (handlers.length === 0) {
      return;
    }

    const startTime = Date.now();

    for (const handler of handlers) {
      try {
        await handler(change);
      } catch (err) {
        console.error(`[CDCWorker] Handler error for ${collectionName}:`, err);
      }
    }

    const latency = Date.now() - startTime;
    if (latency > 100) {
      console.warn(`[CDCWorker] Slow change processing (${latency}ms) for ${collectionName}`);
    }
  }

  private async reconnectWithBackoff(collectionName: string): Promise<void> {
    let delay = this.errorRetryDelay;

    while (this.isRunning) {
      console.log(
        `[CDCWorker] Attempting reconnection in ${delay}ms to ${collectionName}...`,
      );

      await new Promise((resolve) => setTimeout(resolve, delay));

      try {
        await this.watchCollection(collectionName);
        console.log(`[CDCWorker] Successfully reconnected to ${collectionName}`);
        break;
      } catch (err) {
        console.error(`[CDCWorker] Reconnection failed:`, err);
        delay = Math.min(delay * 2, 60000); // Exponential backoff, max 60s
      }
    }
  }

  isActive(): boolean {
    return this.isRunning;
  }

  getHandlerCount(collectionName: string): number {
    return (this.handlers.get(collectionName) || []).length;
  }
}

export const cdcWorker = new CDCWorker();
