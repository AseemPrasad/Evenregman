import { connectToDatabase } from "@/lib/db";
import { outboxRelay } from "@/workers/outbox-relay";
import { env } from "@/lib/env";
import { initializeQueue } from "@/lib/queue";
import { initializeS3Client } from "@/lib/s3";
import { runExportWorker } from "@/jobs/export-worker";

async function bootstrap() {
  const isOutboxRelayEnabled = env.OUTBOX_RELAY_ENABLED === "true";
  const isExportWorkerEnabled = env.ASYNC_EXPORTS_WORKER_ENABLED === "true";

  if (!isOutboxRelayEnabled && !isExportWorkerEnabled) {
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
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Worker Bootstrap] Failed to start worker: ${errorMessage}`);
    process.exit(1);
  }
}

process.on("SIGTERM", async () => {
  console.log("[Worker Bootstrap] Received SIGTERM, gracefully shutting down");
  await outboxRelay.stop();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("[Worker Bootstrap] Received SIGINT, gracefully shutting down");
  await outboxRelay.stop();
  process.exit(0);
});

bootstrap();
