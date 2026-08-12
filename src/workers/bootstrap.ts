import { connectToDatabase } from "@/lib/db";
import { outboxRelay } from "@/workers/outbox-relay";
import { env } from "@/lib/env";

async function bootstrap() {
  const isOutboxRelayEnabled = env.OUTBOX_RELAY_ENABLED === "true";

  if (!isOutboxRelayEnabled) {
    console.log("[Worker Bootstrap] Outbox relay is disabled via OUTBOX_RELAY_ENABLED=false");
    process.exit(0);
  }

  console.log("[Worker Bootstrap] Starting worker bootstrap");

  try {
    await connectToDatabase();
    console.log("[Worker Bootstrap] Connected to database");

    await outboxRelay.start();
    console.log("[Worker Bootstrap] Outbox relay started successfully");
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
