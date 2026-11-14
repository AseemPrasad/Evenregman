import "server-only";

import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { UsageRecordModel, type UsageMetricType } from "@/models/UsageRecord";

/**
 * Asynchronously logs usage without blocking the sub-2ms critical booking path.
 */
export async function trackUsageAsync(params: {
  metric: UsageMetricType;
  quantity: number;
  userId?: string | mongoose.Types.ObjectId;
  orgId?: string | mongoose.Types.ObjectId;
  resourceId?: string | mongoose.Types.ObjectId;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  // Execute in microtask / background to preserve zero latency on lease allocation
  setImmediate(async () => {
    try {
      await connectToDatabase();
      await UsageRecordModel.create({
        metric: params.metric,
        quantity: params.quantity,
        userId: params.userId ? new mongoose.Types.ObjectId(params.userId) : undefined,
        orgId: params.orgId ? new mongoose.Types.ObjectId(params.orgId) : undefined,
        resourceId: params.resourceId ? new mongoose.Types.ObjectId(params.resourceId) : undefined,
        metadata: params.metadata ?? {},
        timestamp: new Date()
      });
    } catch (err) {
      console.error("[Usage Metering] Failed to record usage entry:", err);
    }
  });
}

/**
 * Aggregates monthly consumption for tenant billing or usage auditing.
 */
export async function getTenantMonthlyUsage(orgId?: string): Promise<{
  totalLeaseMinutes: number;
  totalComputeDollars: number;
  totalApiCalls: number;
}> {
  await connectToDatabase();

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const matchFilter: Record<string, unknown> = {
    timestamp: { $gte: startOfMonth }
  };

  if (orgId && mongoose.isValidObjectId(orgId)) {
    matchFilter.orgId = new mongoose.Types.ObjectId(orgId);
  }

  const results = await UsageRecordModel.aggregate([
    { $match: matchFilter },
    {
      $group: {
        _id: "$metric",
        total: { $sum: "$quantity" }
      }
    }
  ]);

  let totalLeaseMinutes = 0;
  let totalComputeDollars = 0;
  let totalApiCalls = 0;

  for (const entry of results) {
    if (entry._id === "LEASE_MINUTES") totalLeaseMinutes = entry.total;
    if (entry._id === "COMPUTE_DOLLARS") totalComputeDollars = entry.total;
    if (entry._id === "API_CALLS") totalApiCalls = entry.total;
  }

  return {
    totalLeaseMinutes,
    totalComputeDollars,
    totalApiCalls
  };
}

