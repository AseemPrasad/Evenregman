import { connectToDatabase } from "@/lib/db";
import { outboxRelay } from "@/workers/outbox-relay";
import { env } from "@/lib/env";
import { initializeQueue } from "@/lib/queue";
import { initializeS3Client } from "@/lib/s3";
import { runExportWorker } from "@/jobs/export-worker";
import { reapExpiredLeases } from "@/lib/mesh/lease-reaper";
import { cdcPipelineRunner } from "@/workers/cdc-pipeline-runner";

let reaperTimer: NodeJS.Timeout | null = null;

async function bootstrap() {
  const isOutboxRelayEnabled = env.OUTBOX_RELAY_ENABLED === "true";
  const isExportWorkerEnabled = env.ASYNC_EXPORTS_WORKER_ENABLED === "true";
  const isLeaseReaperEnabled = process.env.MESH_LEASE_REAPER_ENABLED !== "false";
  const isCdcWorkerEnabled = env.ENABLE_CDC_PIPELINE === "true" && env.CDC_PIPELINE_WORKER_ENABLED === "true";

  if (!isOutboxRelayEnabled && !isExportWorkerEnabled && !isLeaseReaperEnabled && !isCdcWorkerEnabled) {
    console.log("[Worker Bootstrap] All workers are disabled, exiting");
    process.exit(0);
  }

  console.log("[Worker Bootstrap] Starting worker bootstrap");

  try {
    await connectToDatabase();
    console.log("[Worker Bootstrap] Connected to database");

    if (isOutboxRelayEnabled) {
      await outboxRelay.start();
      console.log("[Worker Bootstrap] Outbox relay started successfully");
    }

    if (isExportWorkerEnabled) {
      if (env.ENABLE_ASYNC_EXPORTS !== "true") {
        console.log("[Worker Bootstrap] Async exports disabled, skipping export worker");
      } else {
        console.log("[Worker Bootstrap] Initializing export worker");
        await initializeQueue();
        initializeS3Client();
        await runExportWorker();
        console.log("[Worker Bootstrap] Export worker started successfully");
      }
    }

    // Schedule automatic self-healing lease reaper for ResMesh compute pools
    if (isLeaseReaperEnabled) {
      console.log("[Worker Bootstrap] Starting ResMesh automated lease reaper (60s cycle)");
      reaperTimer = setInterval(async () => {
        try {
          const { reapedCount } = await reapExpiredLeases();
          if (reapedCount > 0) {
            console.log(`[Worker Bootstrap] 🧹 Reclaimed ${reapedCount} expired compute leases`);
          }
        } catch (err) {
          console.error("[Worker Bootstrap] Error in lease reaper cycle:", err);
        }
      }, 60000);
    }

    // Start CDC Change Stream pipeline runner if enabled
    if (isCdcWorkerEnabled) {
      console.log("[Worker Bootstrap] Starting CDC pipeline runner");
      await cdcPipelineRunner.start();
      console.log("[Worker Bootstrap] CDC pipeline runner started successfully");
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Worker Bootstrap] Failed to start worker: ${errorMessage}`);
    process.exit(1);
  }
}

process.on("SIGTERM", async () => {
  console.log("[Worker Bootstrap] Received SIGTERM, gracefully shutting down");
  if (reaperTimer) clearInterval(reaperTimer);
  await outboxRelay.stop();
  await cdcPipelineRunner.stop();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("[Worker Bootstrap] Received SIGINT, gracefully shutting down");
  if (reaperTimer) clearInterval(reaperTimer);
  await outboxRelay.stop();
  await cdcPipelineRunner.stop();
  process.exit(0);
});

bootstrap();
