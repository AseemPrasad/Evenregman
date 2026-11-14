import "server-only";

import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { RegistrationModel } from "@/models/Registration";
import { EventModel } from "@/models/Event";
import { redisReleaseLease } from "@/lib/mesh/lease-redis";
import { redisSyncEventCapacity } from "@/lib/redis-operations";
import { revalidateEventCache } from "@/lib/cache-revalidation";

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
    let resourceSlug = "";
    let remainingCapacity = 0;

    try {
      await session.withTransaction(async () => {
        lease.status = "EXPIRED";
        await lease.save({ session });

        // Free slot on the resource and reopen if it was FULL
        const updatedResource = await EventModel.findByIdAndUpdate(
          lease.eventId,
          {
            $inc: { attendeeCount: -1 },
            $set: { status: "OPEN", updatedAt: now }
          },
          { session, new: true }
        );

        if (updatedResource) {
          resourceSlug = updatedResource.slug;
          remainingCapacity = Math.max(0, updatedResource.capacity - updatedResource.attendeeCount);
        }
      });

      // Clear Redis lease slot only after DB transaction successfully commits
      await redisReleaseLease(lease.eventId.toString(), lease._id.toString());

      // Sync Redis capacity counter with reclaimed seat
      await redisSyncEventCapacity(lease.eventId.toString(), remainingCapacity);

      // Revalidate L2 cache and tags
      if (resourceSlug) {
        try {
          await revalidateEventCache(resourceSlug);
        } catch {
          // Non-blocking fail-safe
        }
      }

      reapedCount++;
    } catch (err) {
      console.error(`[Lease Reaper] Failed to atomically reclaim lease ${lease._id}:`, err);
    } finally {
      session.endSession();
    }
  }

  return { reapedCount };
}
