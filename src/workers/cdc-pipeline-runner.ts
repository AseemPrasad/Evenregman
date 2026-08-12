import "server-only";

import { env } from "@/lib/env";
import { cdcWorker } from "@/workers/cdc-worker";
import { cdcProjectionEngine, registerDefaultProjections } from "@/lib/cdc-projection";
import { resumeTokenManager } from "@/lib/cdc-resume-token";
import { connectToDatabase } from "@/lib/db";
import { AnalyticsTimeSeriesModel } from "@/models/AnalyticsTimeSeries";

type WorkerConfig = {
  batchSize: number;
  batchIntervalMs: number;
};

class CDCPipelineRunner {
  private isRunning = false;
  private config: WorkerConfig;
  private eventBatch: any[] = [];
  private batchTimer: NodeJS.Timeout | null = null;

  constructor(config?: Partial<WorkerConfig>) {
    const batchSize = parseInt(env.CDC_BATCH_SIZE || "100");
    const batchIntervalMs = parseInt(env.CDC_BATCH_INTERVAL_MS || "5000");

    this.config = {
      batchSize: config?.batchSize ?? batchSize,
      batchIntervalMs: config?.batchIntervalMs ?? batchIntervalMs,
    };
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn("[CDCPipeline] Already running");
      return;
    }

    if (!env.ENABLE_CDC_PIPELINE) {
      console.warn("[CDCPipeline] CDC pipeline disabled (ENABLE_CDC_PIPELINE=false)");
      return;
    }

    if (!env.CDC_PIPELINE_WORKER_ENABLED) {
      console.warn("[CDCPipeline] CDC worker not enabled (CDC_PIPELINE_WORKER_ENABLED=false)");
      return;
    }

    console.log("[CDCPipeline] Starting CDC pipeline runner");
    console.log(
      `[CDCPipeline] Config: batchSize=${this.config.batchSize}, batchIntervalMs=${this.config.batchIntervalMs}`,
    );

    this.isRunning = true;

    await connectToDatabase();
    await AnalyticsTimeSeriesModel.collection.createIndexes();

    // Register default projections
    registerDefaultProjections();

    // Register CDC event handler
    cdcWorker.registerHandler("registrations", async (event) => {
      await this.handleChange(event);
    });

    // Start watching changes
    await cdcWorker.start("registrations");

    // Handle graceful shutdown
    process.on("SIGTERM", () => this.stop());
    process.on("SIGINT", () => this.stop());

    console.log("[CDCPipeline] CDC pipeline started successfully");
  }

  async stop(): Promise<void> {
    console.log("[CDCPipeline] Stopping CDC pipeline runner");
    this.isRunning = false;

    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    if (this.eventBatch.length > 0) {
      await this.processBatch();
    }

    await cdcWorker.stop();
  }

  private async handleChange(event: any): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.eventBatch.push(event);

    if (this.eventBatch.length >= this.config.batchSize) {
      await this.processBatch();
    } else if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => {
        this.processBatch().catch((err) => console.error("[CDCPipeline] Batch processing error:", err));
      }, this.config.batchIntervalMs);
    }
  }

  private async processBatch(): Promise<void> {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    if (this.eventBatch.length === 0) {
      return;
    }

    const batch = this.eventBatch.splice(0, this.config.batchSize);
    const startTime = Date.now();

    try {
      for (const event of batch) {
        try {
          await cdcProjectionEngine.projectEvent(event, "registrations");
        } catch (err) {
          console.error("[CDCPipeline] Error projecting event:", err);
        }
      }

      // Save resume token after successful batch processing
      if (batch.length > 0 && batch[batch.length - 1].resumeToken) {
        await resumeTokenManager.saveToken("registrations", batch[batch.length - 1].resumeToken);
      }

      const latency = Date.now() - startTime;
      console.log(`[CDCPipeline] Processed ${batch.length} events in ${latency}ms`);

      if (latency > 100) {
        console.warn(`[CDCPipeline] Slow batch processing (${latency}ms)`);
      }
    } catch (err) {
      console.error("[CDCPipeline] Batch processing failed:", err);
    }
  }

  isActive(): boolean {
    return this.isRunning;
  }

  getBatchSize(): number {
    return this.eventBatch.length;
  }

  getConfig(): WorkerConfig {
    return this.config;
  }
}

export const cdcPipelineRunner = new CDCPipelineRunner();

// Start pipeline if enabled
if (env.ENABLE_CDC_PIPELINE && env.CDC_PIPELINE_WORKER_ENABLED) {
  cdcPipelineRunner.start().catch((err) => {
    console.error("[CDCPipeline] Failed to start:", err);
  });
}
