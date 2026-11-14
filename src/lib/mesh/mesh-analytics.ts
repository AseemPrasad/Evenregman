import "server-only";

import { connectToDatabase } from "@/lib/db";
import { EventModel } from "@/models/Event";
import { RegistrationModel } from "@/models/Registration";

export async function getMeshOverview() {
  await connectToDatabase();

  const now = new Date();

  // Active compute/staging resources
  const resources = await EventModel.find({
    kind: "RESOURCE",
    status: { $ne: "DELETED" }
  }).lean();

  // Active leases
  const activeLeases = await RegistrationModel.find({
    kind: "LEASE",
    status: "ACTIVE",
    leaseExpiresAt: { $gt: now }
  })
    .populate("eventId", "title slug resourceType hourlyCostRate")
    .populate("attendeeId", "name email")
    .lean();

  const totalSlots = resources.reduce((sum, r) => sum + r.capacity, 0);
  const occupiedSlots = activeLeases.length;
  const utilizationPercent = totalSlots > 0 ? Math.round((occupiedSlots / totalSlots) * 100) : 0;

  // Compute burn rate
  const activeBurnRate = activeLeases.reduce((sum, lease) => {
    const event = lease.eventId as any;
    return sum + (event?.hourlyCostRate || 0);
  }, 0);

  return {
    resources,
    activeLeases,
    metrics: {
      totalResources: resources.length,
      totalSlots,
      occupiedSlots,
      freeSlots: Math.max(0, totalSlots - occupiedSlots),
      utilizationPercent,
      activeBurnRate
    }
  };
}

