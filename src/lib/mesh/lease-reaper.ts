import "server-only";

import { connectToDatabase } from "@/lib/db";
import { RegistrationModel } from "@/models/Registration";
import { EventModel } from "@/models/Event";
import { outboxPublisher } from "@/lib/outbox";
import { redisReleaseLease } from "@/lib/mesh/lease-redis";

/**
 * Sweeps for expired leases and automatically reclaims slots,
 * preventing zombie compute and resource hoarding.
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
    try {
      lease.status = "EXPIRED";
      await lease.save();

      // Free slot on the resource and reopen if it was FULL
      await EventModel.findByIdAndUpdate(lease.eventId, {
        $inc: { attendeeCount: -1 },
        $set: { status: "OPEN", updatedAt: now }
      });

      // Clear Redis slot
      await redisReleaseLease(lease.eventId.toString(), lease._id.toString());

      reapedCount++;
    } catch (err) {
      console.error(`[Lease Reaper] Failed to reclaim lease ${lease._id}:`, err);
    }
  }

  return { reapedCount };
}

