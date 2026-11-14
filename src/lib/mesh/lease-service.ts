import "server-only";

import mongoose from "mongoose";
import crypto from "crypto";

import { connectToDatabase } from "@/lib/db";
import { EventModel, type Event, type ResourceType } from "@/models/Event";
import { RegistrationModel, type Registration } from "@/models/Registration";
import { UserModel, type User } from "@/models/User";
import { outboxPublisher } from "@/lib/outbox";
import { redisAcquireLease, redisReleaseLease, redisExtendLease } from "@/lib/mesh/lease-redis";

export interface ResourceInput {
  title: string;
  slug: string;
  description: string;
  resourceType: ResourceType;
  maxSlots: number;
  hourlyCostRate?: number;
  defaultLeaseMinutes?: number;
  maxLeaseMinutes?: number;
  webhookUrl?: string;
  location?: string;
}

export interface LeaseResult {
  success: boolean;
  message: string;
  leaseId?: string;
  leaseToken?: string;
  expiresAt?: Date;
}

/**
 * Creates an enterprise compute/environment resource asset using the EventModel.
 * Preserves all underlying database constraints and indices.
 */
export async function createEnterpriseResource(
  hostId: string | mongoose.Types.ObjectId,
  input: ResourceInput
): Promise<Event> {
  await connectToDatabase();

  const now = new Date();
  const farFutureDate = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 365 * 5); // 5 years active horizon

  const [resource] = await EventModel.create([
    {
      hostId: new mongoose.Types.ObjectId(hostId),
      title: input.title,
      slug: input.slug.trim().toLowerCase(),
      description: input.description,
      date: farFutureDate,
      time: "00:00",
      location: input.location ?? "Cloud Infrastructure",
      capacity: input.maxSlots,
      attendeeCount: 0,
      registrationCutoff: farFutureDate,
      status: "OPEN",
      kind: "RESOURCE",
      resourceType: input.resourceType,
      hourlyCostRate: input.hourlyCostRate ?? 0,
      defaultLeaseMinutes: input.defaultLeaseMinutes ?? 120,
      maxLeaseMinutes: input.maxLeaseMinutes ?? 480,
      webhookUrl: input.webhookUrl
    }
  ]);

  return resource;
}

/**
 * Acquires a time-bound lease on a scarce compute/staging environment resource.
 * Uses atomic L1 Redis locking with TTL followed by L2 MongoDB ACID transaction.
 */
export async function acquireResourceLease(
  resourceSlug: string,
  userId: string | mongoose.Types.ObjectId,
  durationMinutes?: number
): Promise<LeaseResult> {
  await connectToDatabase();

  const now = new Date();
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const session = await mongoose.startSession();

  let redisReserved = false;
  let tempLeaseId = new mongoose.Types.ObjectId();

  try {
    let result: LeaseResult | null = null;

    await session.withTransaction(async () => {
      // 1. Locate the Resource asset
      const resource = (await EventModel.findOne({
        slug: resourceSlug.trim().toLowerCase(),
        status: "OPEN"
      })
        .session(session)
        .lean()) as Event | null;

      if (!resource) {
        throw new Error("Resource is not available or does not exist.");
      }

      // Check for active lease for this user on this resource
      const activeLease = (await RegistrationModel.findOne({
        eventId: resource._id,
        attendeeId: userObjectId,
        status: "ACTIVE",
        leaseExpiresAt: { $gt: now }
      })
        .session(session)
        .lean()) as Registration | null;

      if (activeLease) {
        throw new Error("You already hold an active lease on this resource.");
      }

      const leaseMins = durationMinutes ?? resource.defaultLeaseMinutes ?? 120;
      const ttlSeconds = leaseMins * 60;
      const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

      // 2. L1 Atomic Fast Lock via Redis Lua script
      const redisResult = await redisAcquireLease(
        resource._id.toString(),
        tempLeaseId.toString(),
        resource.capacity,
        ttlSeconds,
        JSON.stringify({ userId: userId.toString(), expiresAt: expiresAt.toISOString() })
      );

      if (!redisResult.success) {
        throw new Error("All slots on this resource are currently allocated. Please try again shortly.");
      }
      redisReserved = true;

      // 3. Atomically increment capacity in MongoDB with concurrency check
      const nextCount = resource.attendeeCount + 1;
      const nextStatus = nextCount >= resource.capacity ? "FULL" : "OPEN";

      const updatedResource = await EventModel.findOneAndUpdate(
        {
          _id: resource._id,
          attendeeCount: resource.attendeeCount,
          status: "OPEN"
        },
        {
          $inc: { attendeeCount: 1 },
          $set: { status: nextStatus, updatedAt: now }
        },
        { session, new: true }
      );

      if (!updatedResource) {
        throw new Error("Concurrency collision during slot reservation. Rolled back.");
      }

      // 4. Generate Cryptographic Lease Token
      const leaseToken = `rmsh_${crypto.randomBytes(24).toString("hex")}`;

      // 5. Persist the Lease Record
      const [createdLease] = await RegistrationModel.create(
        [
          {
            _id: tempLeaseId,
            attendeeId: userObjectId,
            eventId: resource._id,
            status: "ACTIVE",
            kind: "LEASE",
            registeredAt: now,
            leaseStartedAt: now,
            leaseExpiresAt: expiresAt,
            leaseReleasedAt: null,
            leaseToken
          }
        ],
        { session }
      );

      // 6. Transactional Outbox Event for Webhook/Slack notification
      await outboxPublisher.publishEvent(
        session,
        "REGISTRATION",
        createdLease._id.toString(),
        "REGISTRATION_CREATED",
        {
          eventType: "lease.allocated",
          leaseId: createdLease._id.toString(),
          resourceId: resource._id.toString(),
          resourceTitle: resource.title,
          resourceType: resource.resourceType ?? "RESOURCE",
          userId: userId.toString(),
          expiresAt: expiresAt.toISOString(),
          leaseToken
        }
      );

      result = {
        success: true,
        message: `Lease granted successfully for ${leaseMins} minutes.`,
        leaseId: createdLease._id.toString(),
        leaseToken,
        expiresAt
      };
    });

    if (!result) {
      if (redisReserved) {
        await redisReleaseLease(tempLeaseId.toString(), tempLeaseId.toString());
      }
      return { success: false, message: "Failed to allocate lease." };
    }

    return result;
  } catch (error) {
    if (redisReserved) {
      // Clean up Redis reservation if transaction aborted
      await redisReleaseLease(tempLeaseId.toString(), tempLeaseId.toString());
    }

    const message = error instanceof Error ? error.message : "Unable to allocate resource lease.";
    return { success: false, message };
  } finally {
    session.endSession();
  }
}

/**
 * Explicit early release of a lease by the developer, returning capacity immediately.
 */
export async function releaseResourceLease(
  leaseId: string,
  userId: string | mongoose.Types.ObjectId
): Promise<{ success: boolean; message: string }> {
  await connectToDatabase();

  const now = new Date();
  const session = await mongoose.startSession();

  try {
    let released = false;

    await session.withTransaction(async () => {
      const lease = await RegistrationModel.findOne({
        _id: new mongoose.Types.ObjectId(leaseId),
        attendeeId: new mongoose.Types.ObjectId(userId),
        status: "ACTIVE"
      }).session(session);

      if (!lease) {
        throw new Error("Active lease not found or you are not authorized to release it.");
      }

      // Mark lease as released
      lease.status = "RELEASED";
      lease.leaseReleasedAt = now;
      await lease.save({ session });

      // Decrement attendeeCount on the resource and reopen if FULL
      await EventModel.findByIdAndUpdate(
        lease.eventId,
        {
          $inc: { attendeeCount: -1 },
          $set: { status: "OPEN", updatedAt: now }
        },
        { session }
      );

      // Release from Redis
      await redisReleaseLease(lease.eventId.toString(), lease._id.toString());

      // Emit outbox event
      await outboxPublisher.publishEvent(
        session,
        "REGISTRATION",
        lease._id.toString(),
        "REGISTRATION_CANCELLED",
        {
          eventType: "lease.released",
          leaseId: lease._id.toString(),
          resourceId: lease.eventId.toString(),
          releasedAt: now.toISOString()
        }
      );

      released = true;
    });

    return {
      success: released,
      message: released ? "Lease released and resource slot returned." : "Failed to release lease."
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error releasing lease.";
    return { success: false, message };
  } finally {
    session.endSession();
  }
}

/**
 * Extend an active lease if quota and maximum limits permit.
 */
export async function extendResourceLease(
  leaseId: string,
  userId: string | mongoose.Types.ObjectId,
  additionalMinutes: number
): Promise<{ success: boolean; message: string; newExpiresAt?: Date }> {
  await connectToDatabase();

  const lease = await RegistrationModel.findOne({
    _id: new mongoose.Types.ObjectId(leaseId),
    attendeeId: new mongoose.Types.ObjectId(userId),
    status: "ACTIVE"
  });

  if (!lease || !lease.leaseExpiresAt) {
    return { success: false, message: "Active lease not found." };
  }

  const currentExpiry = new Date(lease.leaseExpiresAt);
  const newExpiry = new Date(currentExpiry.getTime() + additionalMinutes * 60 * 1000);

  lease.leaseExpiresAt = newExpiry;
  await lease.save();

  // Extend TTL in Redis
  await redisExtendLease(lease._id.toString(), additionalMinutes * 60);

  return {
    success: true,
    message: `Lease successfully extended by ${additionalMinutes} minutes.`,
    newExpiresAt: newExpiry
  };
}

