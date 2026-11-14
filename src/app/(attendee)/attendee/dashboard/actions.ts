"use server";

import mongoose from "mongoose";
import { revalidatePath } from "next/cache";

import { auth } from "@/lib/session";
import { connectToDatabase } from "@/lib/db";
import { AuthorizationError, assertRegistrationOwnership, toObjectId } from "@/lib/ownership";
import { EventModel, type Event } from "@/models/Event";
import { RegistrationModel } from "@/models/Registration";
import { attendeeCancellationSchema } from "@/schemas/registration";
import { redisSyncEventCapacity } from "@/lib/redis-operations";
import { invalidateEventCache } from "@/lib/cache-service";
import { outboxPublisher } from "@/lib/outbox";

export type CancelRegistrationState = {
  success: boolean;
  message: string;
};

export async function cancelRegistrationAction(registrationId: string): Promise<CancelRegistrationState> {
  const session = await auth();

  if (!session?.user || session.user.role !== "ATTENDEE") {
    return { success: false, message: "You must be signed in as an attendee." };
  }

  const parsed = attendeeCancellationSchema.safeParse({ registrationId });

  if (!parsed.success) {
    return { success: false, message: "Invalid registration id." };
  }

  await connectToDatabase();

  const mongoSession = await mongoose.startSession();

  try {
    let cancelledEventSlug: string | null = null;
    let cancelledEventId: string | null = null;

    await mongoSession.withTransaction(async () => {
      const ownedRegistration = await assertRegistrationOwnership(parsed.data.registrationId, session.user.id);

      if (ownedRegistration.status !== "ACTIVE") {
        throw new Error("This registration has already been cancelled.");
      }

      const event = (await EventModel.findOne({
        _id: toObjectId(ownedRegistration.eventId),
        status: { $in: ["OPEN", "FULL", "CLOSED"] }
      })
        .session(mongoSession)
        .select({
          _id: 1,
          slug: 1,
          attendeeCount: 1,
          capacity: 1,
          status: 1
        })
        .lean()) as
        | Pick<Event, "_id" | "slug" | "attendeeCount" | "capacity" | "status">
        | null;

      if (!event) {
        throw new Error("Associated event not found.");
      }

      const nextAttendeeCount = Math.max(event.attendeeCount - 1, 0);
      const nextStatus = event.status === "FULL" && nextAttendeeCount < event.capacity ? "OPEN" : event.status;

      const updatedRegistration = await RegistrationModel.findOneAndUpdate(
        {
          _id: toObjectId(parsed.data.registrationId),
          attendeeId: toObjectId(session.user.id),
          status: "ACTIVE"
        },
        {
          $set: {
            status: "CANCELLED",
            cancelledAt: new Date(),
            updatedAt: new Date()
          }
        },
        { new: true, session: mongoSession }
      ).lean();

      if (!updatedRegistration) {
        throw new Error("Unable to cancel this registration.");
      }

      await EventModel.updateOne(
        { _id: event._id },
        {
          $set: {
            attendeeCount: nextAttendeeCount,
            status: nextStatus,
            updatedAt: new Date()
          }
        },
        { session: mongoSession }
      );

      // Publish Transactional Outbox Event for cancellation
      await outboxPublisher.publishEvent(
        mongoSession,
        "REGISTRATION",
        updatedRegistration._id.toString(),
        "REGISTRATION_CANCELLED",
        {
          registrationId: updatedRegistration._id.toString(),
          attendeeId: session.user.id,
          eventId: event._id.toString(),
          eventSlug: event.slug,
          cancelledAt: new Date().toISOString()
        }
      );

      cancelledEventSlug = event.slug;
      cancelledEventId = event._id.toString();
      const remainingSeats = Math.max(0, event.capacity - nextAttendeeCount);
      (mongoSession as any).__remainingSeats = remainingSeats;
    });

    if (!cancelledEventSlug || !cancelledEventId) {
      return { success: false, message: "Unable to cancel this registration." };
    }

    // Sync Redis capacity counter with vacated seat
    const remainingSeats = (mongoSession as any).__remainingSeats ?? 0;
    await redisSyncEventCapacity(cancelledEventId, remainingSeats);

    // Invalidate L2 Redis cache
    try {
      await invalidateEventCache(cancelledEventSlug);
    } catch {
      // Non-blocking fail-safe
    }

    revalidatePath("/attendee/dashboard");
    revalidatePath("/host/dashboard");
    revalidatePath(`/host/events/${cancelledEventId}/registrations`);
    revalidatePath(`/events/${cancelledEventSlug}`);

    return { success: true, message: "Registration cancelled successfully." };
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return { success: false, message: error.message };
    }

    if (error instanceof Error) {
      return { success: false, message: error.message };
    }

    return { success: false, message: "Unable to cancel registration right now." };
  } finally {
    mongoSession.endSession();
  }
}
