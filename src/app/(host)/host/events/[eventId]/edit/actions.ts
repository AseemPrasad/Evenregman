"use server";

import { isValidObjectId } from "mongoose";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/lib/session";
import { connectToDatabase } from "@/lib/db";
import { EventModel, type EventStatus } from "@/models/Event";
import { assertEventOwnership, AuthorizationError } from "@/lib/ownership";
import { eventUpdateFormSchema, eventUpdateSchema } from "@/schemas/event";
import { generateUniqueEventSlug } from "@/lib/slug";

export type UpdateEventFormValues = {
  title: string;
  description: string;
  date: string;
  time: string;
  location: string;
  capacity: number;
  registrationCutoff: string;
};

export type UpdateEventState = {
  success: boolean;
  message?: string;
  event?: {
    id: string;
    slug: string;
    title: string;
  };
  fieldErrors?: Partial<Record<keyof UpdateEventFormValues, string>>;
};

type EventStatusActionResult = {
  success: boolean;
  message: string;
};

function mapZodErrors(error: z.ZodError<UpdateEventFormValues>) {
  const fieldErrors: Partial<Record<keyof UpdateEventFormValues, string>> = {};

  for (const issue of error.issues) {
    const field = issue.path[0] as keyof UpdateEventFormValues | undefined;

    if (field && !fieldErrors[field]) {
      fieldErrors[field] = issue.message;
    }
  }

  return fieldErrors;
}

function isDuplicateKeyError(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: number }).code === 11000
  );
}

async function updateEventStatus(eventId: string, nextStatus: EventStatus): Promise<EventStatusActionResult> {
  const session = await auth();

  if (!session?.user || session.user.role !== "HOST") {
    return { success: false, message: "You must be signed in as a host." };
  }

  try {
    await assertEventOwnership(eventId, session.user.id);
    await connectToDatabase();

    const existingEvent = (await EventModel.findOne({ _id: eventId, hostId: session.user.id })
      .select({ _id: 1, slug: 1 })
      .lean()) as { _id: string; slug: string } | null;

    if (!existingEvent) {
      return { success: false, message: "Event not found." };
    }

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
    revalidatePath(`/host/events/${eventId}/edit`);
  revalidatePath(`/events/${existingEvent.slug}`);

    return { success: true, message: "Event updated successfully." };
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return { success: false, message: error.message };
    }

    return { success: false, message: "Unable to update event status right now." };
  }
}

export async function updateEventAction(
  eventId: string,
  _previousState: UpdateEventState,
  formValues: UpdateEventFormValues
): Promise<UpdateEventState> {
  const session = await auth();

  if (!session?.user || session.user.role !== "HOST") {
    return {
      success: false,
      message: "You must be signed in as a host to update events."
    };
  }

  try {
    await assertEventOwnership(eventId, session.user.id);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return { success: false, message: error.message };
    }

    return { success: false, message: "Unable to verify event ownership." };
  }

  const parsed = eventUpdateFormSchema.safeParse(formValues);

  if (!parsed.success) {
    return {
      success: false,
      message: "Please fix the highlighted fields.",
      fieldErrors: mapZodErrors(parsed.error)
    };
  }

  const semanticValidation = eventUpdateSchema.safeParse({
    title: parsed.data.title,
    description: parsed.data.description,
    date: parsed.data.date,
    time: parsed.data.time,
    location: parsed.data.location,
    capacity: parsed.data.capacity,
    registrationCutoff: parsed.data.registrationCutoff
  });

  if (!semanticValidation.success) {
    return {
      success: false,
      message: "Please fix the highlighted fields.",
      fieldErrors: mapZodErrors(semanticValidation.error as z.ZodError<UpdateEventFormValues>)
    };
  }

  const normalizedEvent = semanticValidation.data;

  await connectToDatabase();

  const existingEvent = (await EventModel.findOne({ _id: eventId, hostId: session.user.id })
    .select({
      _id: 1,
      title: 1,
      slug: 1,
      attendeeCount: 1,
      capacity: 1
    })
    .lean()) as
    | {
        _id: string;
        title: string;
        slug: string;
        attendeeCount: number;
        capacity: number;
      }
    | null;

  if (!existingEvent) {
    return {
      success: false,
      message: "Event not found."
    };
  }

  const nextCapacity = normalizedEvent.capacity ?? existingEvent.capacity;

  if (nextCapacity < existingEvent.attendeeCount) {
    return {
      success: false,
      message: "Capacity cannot be lower than the current attendee count."
    };
  }

  const nextSlug =
    normalizedEvent.title && normalizedEvent.title.trim() !== existingEvent.title
      ? await generateUniqueEventSlug(normalizedEvent.title)
      : existingEvent.slug;

  try {
    const updatedEvent = (await EventModel.findOneAndUpdate(
      { _id: eventId, hostId: session.user.id },
      {
        $set: {
          title: normalizedEvent.title,
          slug: nextSlug,
          description: normalizedEvent.description,
          date: normalizedEvent.date,
          time: normalizedEvent.time,
          location: normalizedEvent.location,
          capacity: nextCapacity,
          registrationCutoff: normalizedEvent.registrationCutoff,
          updatedAt: new Date()
        }
      },
      { new: true, runValidators: true }
    ).lean()) as
      | {
          _id: string;
          slug: string;
          title: string;
        }
      | null;

    if (!updatedEvent) {
      return {
        success: false,
        message: "Unable to update this event right now."
      };
    }

    revalidatePath("/host/dashboard");
    revalidatePath(`/host/events/${eventId}/edit`);
    revalidatePath(`/events/${existingEvent.slug}`);
    revalidatePath(`/events/${updatedEvent.slug}`);

    return {
      success: true,
      message: "Event updated successfully.",
      event: {
        id: updatedEvent._id.toString(),
        slug: updatedEvent.slug,
        title: updatedEvent.title
      }
    };
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return {
        success: false,
        message: "That event title creates a duplicate slug. Please choose a different title."
      };
    }

    return {
      success: false,
      message: "Unable to update this event right now. Please try again."
    };
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
