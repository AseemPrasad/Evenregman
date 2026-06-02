"use server";

import { z } from "zod";
import { isValidObjectId } from "mongoose";

import { auth } from "@/lib/session";
import { connectToDatabase } from "@/lib/db";
import { EventModel } from "@/models/Event";
import { eventCreationFormSchema, eventCreationSchema } from "@/schemas/event";
import { generateUniqueEventSlug } from "@/lib/slug";

export type CreateEventFormValues = {
  title: string;
  description: string;
  date: string;
  time: string;
  location: string;
  capacity: number;
  registrationCutoff: string;
};

export type CreateEventState = {
  success: boolean;
  message?: string;
  event?: {
    id: string;
    slug: string;
    title: string;
  };
  fieldErrors?: Partial<Record<keyof CreateEventFormValues, string>>;
};

function mapZodErrors(error: z.ZodError<CreateEventFormValues>) {
  const fieldErrors: Partial<Record<keyof CreateEventFormValues, string>> = {};

  for (const issue of error.issues) {
    const field = issue.path[0] as keyof CreateEventFormValues | undefined;

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

export async function createEventAction(
  _previousState: CreateEventState,
  formValues: CreateEventFormValues
): Promise<CreateEventState> {
  const session = await auth();

  if (!session?.user || session.user.role !== "HOST") {
    return {
      success: false,
      message: "You must be signed in as a host to create events."
    };
  }

  const parsed = eventCreationFormSchema.safeParse(formValues);

  if (!parsed.success) {
    return {
      success: false,
      message: "Please fix the highlighted fields.",
      fieldErrors: mapZodErrors(parsed.error)
    };
  }

  const semanticValidation = eventCreationSchema.safeParse({
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
      fieldErrors: mapZodErrors(semanticValidation.error as z.ZodError<CreateEventFormValues>)
    };
  }

  await connectToDatabase();

  const hostId = session.user.id;
  if (!isValidObjectId(hostId)) {
    return {
      success: false,
      message: "Invalid host session. Please sign in again."
    };
  }

  const normalizedEvent = semanticValidation.data;
  const createdAt = new Date();

  for (let attempt = 0; attempt < 25; attempt += 1) {
    const slug = await generateUniqueEventSlug(normalizedEvent.title);

    try {
      const event = await EventModel.create({
        hostId,
        title: normalizedEvent.title,
        slug,
        description: normalizedEvent.description,
        date: normalizedEvent.date,
        time: normalizedEvent.time,
        location: normalizedEvent.location,
        capacity: normalizedEvent.capacity,
        attendeeCount: 0,
        registrationCutoff: normalizedEvent.registrationCutoff,
        status: "OPEN",
        closedAt: null,
        deletedAt: null,
        createdAt,
        updatedAt: createdAt
      });

      return {
        success: true,
        message: "Event created successfully.",
        event: {
          id: event._id.toString(),
          slug: event.slug,
          title: event.title
        }
      };
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        continue;
      }

      return {
        success: false,
        message: "Unable to create the event right now. Please try again."
      };
    }
  }

  return {
    success: false,
    message: "Could not generate a unique slug for this event. Please adjust the title and try again."
  };
}
