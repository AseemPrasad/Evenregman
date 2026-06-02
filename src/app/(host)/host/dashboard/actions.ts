"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/lib/session";
import { connectToDatabase } from "@/lib/db";
import { EventModel, type EventStatus } from "@/models/Event";
import { assertEventOwnership, AuthorizationError } from "@/lib/ownership";

type EventStatusActionResult = {
  success: boolean;
  message: string;
};

async function updateEventStatus(eventId: string, nextStatus: EventStatus): Promise<EventStatusActionResult> {
  const session = await auth();

  if (!session?.user || session.user.role !== "HOST") {
    return { success: false, message: "You must be signed in as a host." };
  }

  try {
    await assertEventOwnership(eventId, session.user.id);
    await connectToDatabase();

    const update: Record<string, unknown> = {
      status: nextStatus,
      updatedAt: new Date()
    };

    if (nextStatus === "CLOSED") {
      update.closedAt = new Date();
      update.deletedAt = null;
    }

    if (nextStatus === "OPEN") {
      update.closedAt = null;
      update.deletedAt = null;
    }

    if (nextStatus === "DELETED") {
      update.deletedAt = new Date();
      update.closedAt = null;
    }

    await EventModel.updateOne({ _id: eventId }, { $set: update });

    revalidatePath("/host/dashboard");
    return { success: true, message: "Event updated successfully." };
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return { success: false, message: error.message };
    }

    return { success: false, message: "Unable to update event status right now." };
  }
}

export async function closeEventAction(eventId: string): Promise<EventStatusActionResult> {
  return updateEventStatus(eventId, "CLOSED");
}

export async function reopenEventAction(eventId: string): Promise<EventStatusActionResult> {
  return updateEventStatus(eventId, "OPEN");
}

export async function deleteEventAction(eventId: string): Promise<EventStatusActionResult> {
  return updateEventStatus(eventId, "DELETED");
}
