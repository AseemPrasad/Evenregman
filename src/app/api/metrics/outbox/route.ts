import { NextResponse } from "next/server";

import { outboxMetrics } from "@/lib/outbox-metrics";

export async function GET() {
  const metrics = outboxMetrics.getMetrics();

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
  outboxMetrics.reset();

  return NextResponse.json(
    {
      success: true,
      message: "Outbox metrics reset successfully"
    },
    {
      status: 200
    }
  );
}
