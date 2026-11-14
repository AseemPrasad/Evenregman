import "server-only";

import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { RegistrationModel } from "@/models/Registration";
import { EventModel } from "@/models/Event";
import { redisReleaseLease } from "@/lib/mesh/lease-redis";

/**
 * Sweeps for expired leases and automatically reclaims slots,
 * preventing zombie compute and resource hoarding.
 * Wrapped in atomic MongoDB multi-document transactions.
 */
export async function reapExpiredLeases(): Promise<{ reapedCount: number }> {
  await connectToDatabase();

  const now = new Date();

  // Find all active leases that have exceeded their expiration time
  const expiredLeases = await RegistrationModel.find({
    kind: "LEASE",
    status: "ACTIVE",
    leaseExpiresAt: { $lte: now }
  }).limit(50);

  let reapedCount = 0;

  for (const lease of expiredLeases) {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        lease.status = "EXPIRED";
        await lease.save({ session });

        // Free slot on the resource and reopen if it was FULL
        await EventModel.findByIdAndUpdate(
          lease.eventId,
          {
            $inc: { attendeeCount: -1 },
            $set: { status: "OPEN", updatedAt: now }
          },
          { session }
        );
      });

      // Clear Redis slot only after DB transaction successfully commits
      await redisReleaseLease(lease.eventId.toString(), lease._id.toString());
      reapedCount++;
    } catch (err) {
      console.error(`[Lease Reaper] Failed to atomically reclaim lease ${lease._id}:`, err);
    } finally {
      session.endSession();
    }
  }

  return { reapedCount };
}


