import { NextResponse } from "next/server";

import { metricsCollector } from "@/lib/registration-metrics";

export async function GET() {
  const metrics = metricsCollector.getMetrics();

  return NextResponse.json(
    {
      success: true,
      data: metrics
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Content-Type": "application/json"
      }
    }
  );
}

export async function DELETE() {
  metricsCollector.reset();

  return NextResponse.json(
    {
      success: true,
      message: "Metrics reset successfully"
    },
    {
      status: 200
    }
  );
}
