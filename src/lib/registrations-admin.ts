import "server-only";

import mongoose, { Types } from "mongoose";

import { connectToDatabase } from "@/lib/db";
import { RegistrationModel } from "@/models/Registration";
import { EventModel } from "@/models/Event";
import { toObjectId, assertEventOwnership, AuthorizationError } from "@/lib/ownership";
import { redisSyncEventCapacity } from "@/lib/redis-operations";
import { revalidateEventCache } from "@/lib/cache-revalidation";
import { outboxPublisher } from "@/lib/outbox";
import { revalidatePath } from "next/cache";

export type RegistrationListItem = {
  id: string;
  status: string;
  registeredAt: string;
  attendee: {
    id: string;
    name: string;
    email: string;
  };
};

export type RegistrationListResult = {
  total: number;
  page: number;
  limit: number;
  data: RegistrationListItem[];
};

export type RegistrationQueryOptions = {
  page?: number;
  limit?: number;
  search?: string;
  sort?: "newest" | "oldest" | "alpha";
  status?: string | string[];
};

export async function getEventRegistrationsForHost(
  eventId: string | Types.ObjectId,
  hostId: string | Types.ObjectId,
  opts: RegistrationQueryOptions = {}
): Promise<RegistrationListResult> {
  await connectToDatabase();

  // assert ownership - will throw AuthorizationError if not owned
  await assertEventOwnership(eventId, hostId);

  const page = Math.max(1, Number(opts.page || 1));
  const limit = Math.min(200, Math.max(1, Number(opts.limit || 20)));
  const skip = (page - 1) * limit;

  const search = typeof opts.search === "string" && opts.search.trim() ? opts.search.trim() : null;

  const sortMode = opts.sort || "newest";
  let sortStage: Record<string, number> = { registeredAt: -1 };

  if (sortMode === "oldest") sortStage = { registeredAt: 1 };
  if (sortMode === "alpha") sortStage = { "attendee.name": 1 };

  const statusFilter = opts.status
    ? Array.isArray(opts.status)
      ? opts.status
      : [opts.status]
    : ["ACTIVE"];

  const matchStage: any = {
    eventId: toObjectId(eventId),
    status: { $in: statusFilter }
  };

  const pipeline: any[] = [
    { $match: matchStage },
    {
      $lookup: {
        from: "users",
        localField: "attendeeId",
        foreignField: "_id",
        as: "attendee"
      }
    },
    { $unwind: "$attendee" }
  ];

  if (search) {
    const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    pipeline.push({
      $match: {
        $or: [{ "attendee.name": { $regex: regex } }, { "attendee.email": { $regex: regex } }]
      }
    });
  }

  pipeline.push(
    {
      $facet: {
        metadata: [{ $count: "total" }],
        data: [
          { $sort: sortStage },
          { $skip: skip },
          { $limit: limit },
          {
            $project: {
              _id: 1,
              status: 1,
              registeredAt: 1,
              "attendee._id": 1,
              "attendee.name": 1,
              "attendee.email": 1
            }
          }
        ]
      }
    },
    {
      $project: {
        total: { $arrayElemAt: ["$metadata.total", 0] },
        data: 1
      }
    }
  );

  const result = await RegistrationModel.aggregate(pipeline).allowDiskUse(true).exec();

  const total = (result?.[0]?.total as number) || 0;
  const rawData = (result?.[0]?.data || []) as any[];

  const data: RegistrationListItem[] = rawData.map((r) => ({
    id: r._id.toString(),
    status: r.status,
    registeredAt: new Date(r.registeredAt).toISOString(),
    attendee: {
      id: r.attendee._id.toString(),
      name: r.attendee.name,
      email: r.attendee.email
    }
  }));

  return {
    total,
    page,
    limit,
    data
  };
}

export async function cancelRegistrationForHost(
  eventId: string,
  registrationId: string,
  hostId: string
): Promise<{ success: boolean; message: string }> {
  await connectToDatabase();

  await assertEventOwnership(eventId, hostId);

  const session = await mongoose.startSession();
  let eventSlug = "";
  let remainingSeats = 0;

  try {
    await session.withTransaction(async () => {
      const regObjectId = toObjectId(registrationId);
      const evObjectId = toObjectId(eventId);

      const registration = await RegistrationModel.findOne({
        _id: regObjectId,
        eventId: evObjectId,
        status: "ACTIVE"
      }).session(session);

      if (!registration) {
        throw new Error("Registration not found or already cancelled.");
      }

      const event = await EventModel.findById(evObjectId).session(session);
      if (!event) {
        throw new Error("Event not found.");
      }

      registration.status = "CANCELLED";
      registration.cancelledAt = new Date();
      await registration.save({ session });

      const nextAttendeeCount = Math.max(0, event.attendeeCount - 1);
      const nextStatus = nextAttendeeCount < event.capacity && event.status === "FULL" ? "OPEN" : event.status;

      await EventModel.updateOne(
        { _id: evObjectId },
        {
          $set: {
            attendeeCount: nextAttendeeCount,
            status: nextStatus,
            updatedAt: new Date()
          }
        },
        { session }
      );

      await outboxPublisher.publishEvent(
        session,
        "REGISTRATION",
        registration._id.toString(),
        "REGISTRATION_CANCELLED",
        {
          registrationId: registration._id.toString(),
          attendeeId: registration.attendeeId.toString(),
          eventId: event._id.toString(),
          eventSlug: event.slug,
          cancelledByHost: true,
          cancelledAt: new Date().toISOString()
        }
      );

      eventSlug = event.slug;
      remainingSeats = Math.max(0, event.capacity - nextAttendeeCount);
    });
  } finally {
    await session.endSession();
  }

  // Sync Redis atomic capacity counter
  await redisSyncEventCapacity(eventId, remainingSeats);

  // Invalidate cache and paths
  try {
    if (eventSlug) {
      await revalidateEventCache(eventSlug);
    }
  } catch (err) {
    console.warn("[cancelRegistrationForHost] Cache revalidation error:", err);
  }

  revalidatePath("/host/dashboard");
  revalidatePath(`/host/events/${eventId}/registrations`);
  revalidatePath("/attendee/dashboard");
  if (eventSlug) {
    revalidatePath(`/events/${eventSlug}`);
  }

  return { success: true, message: "Registration cancelled successfully." };
}
