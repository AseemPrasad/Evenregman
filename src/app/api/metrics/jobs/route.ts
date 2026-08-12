import "server-only";

import { getMetrics, resetMetrics } from "@/lib/job-queue-metrics";

export async function GET(req: Request) {
  try {
    const metrics = getMetrics();

    return new Response(JSON.stringify(metrics), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error: any) {
    const message = error?.message || "Failed to fetch metrics";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    resetMetrics();

    return new Response(
      JSON.stringify({ message: "Metrics reset successfully" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );
  } catch (error: any) {
    const message = error?.message || "Failed to reset metrics";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
