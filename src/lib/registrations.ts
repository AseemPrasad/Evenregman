import "server-only";

import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { isValidObjectId } from "mongoose";

import { connectToDatabase } from "@/lib/db";
import { EventModel, type Event } from "@/models/Event";
import { RegistrationModel, type Registration } from "@/models/Registration";
import { UserModel, type User } from "@/models/User";
import { attendeeRegistrationSchema, type AttendeeRegistrationInput } from "@/schemas/registration";
import { redisCheckAndDecrement, redisRollbackIncrement } from "@/lib/redis-operations";
import { metricsCollector } from "@/lib/registration-metrics";
import { outboxPublisher } from "@/lib/outbox";

type RegistrationBusinessResult = {
  success: boolean;
  message: string;
  accountState?: "created" | "reused";
};

type RegistrationFieldErrors = Partial<Record<keyof AttendeeRegistrationInput, string>>;

function mapZodErrors(error: import("zod").ZodError<AttendeeRegistrationInput>) {
  const fieldErrors: RegistrationFieldErrors = {};

  for (const issue of error.issues) {
    const field = issue.path[0] as keyof AttendeeRegistrationInput | undefined;

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

export async function registerAttendeeForEvent(
  eventSlug: string,
  formValues: AttendeeRegistrationInput
): Promise<RegistrationBusinessResult> {
  metricsCollector.recordRegistrationAttempt("legacy");

  const parsed = attendeeRegistrationSchema.safeParse(formValues);

  if (!parsed.success) {
    const message = Object.values(mapZodErrors(parsed.error)).find(Boolean) ?? "Please fix the highlighted fields.";
    metricsCollector.recordRegistrationFailure("legacy", "validation_error");
    return { success: false, message };
  }

  const normalizedEmail = parsed.data.email;
  const now = new Date();

  await connectToDatabase();

  const session = await mongoose.startSession();

  try {
    let registrationResult: RegistrationBusinessResult | null = null;

    await session.withTransaction(async () => {
      const event = (await EventModel.findOne({
        slug: eventSlug.trim().toLowerCase(),
        status: "OPEN"
      })
        .session(session)
        .select({
          _id: 1,
          title: 1,
          slug: 1,
          capacity: 1,
          attendeeCount: 1,
          registrationCutoff: 1,
          status: 1
        })
        .lean()) as
        | Pick<Event, "_id" | "title" | "slug" | "capacity" | "attendeeCount" | "registrationCutoff" | "status">
        | null;

      if (!event) {
        throw new Error("This event is not open for registration.");
      }

      if (event.registrationCutoff.getTime() <= now.getTime()) {
        throw new Error("Registration cutoff has passed.");
      }

      if (event.attendeeCount >= event.capacity) {
        throw new Error("This event is sold out.");
      }

      const existingUser = (await UserModel.findOne({ email: normalizedEmail })
        .session(session)
        .select({ _id: 1, passwordHash: 1, role: 1 })
        .lean()) as (Pick<User, "_id" | "passwordHash" | "role"> | null);

      let attendeeId: mongoose.Types.ObjectId;
      let accountState: "created" | "reused";

      if (existingUser) {
        if (existingUser.role !== "ATTENDEE") {
          throw new Error("This email belongs to a host account. Use an attendee email instead.");
        }

        const passwordMatches = await bcrypt.compare(parsed.data.password, existingUser.passwordHash);

        if (!passwordMatches) {
          throw new Error("Incorrect password for the existing attendee account.");
        }

        attendeeId = existingUser._id;
        accountState = "reused";
      } else {
        const passwordHash = await bcrypt.hash(parsed.data.password, 12);
        const [createdUser] = await UserModel.create(
          [
            {
              name: parsed.data.name,
              email: normalizedEmail,
              passwordHash,
              role: "ATTENDEE"
            }
          ],
          { session }
        );

        attendeeId = createdUser._id;
        accountState = "created";
      }

      // check for existing registration for this attendee and event
      const existingRegistration = (await RegistrationModel.findOne({ eventId: event._id, attendeeId })
        .session(session)
        .select({ _id: 1 })
        .lean()) as Pick<Registration, "_id"> | null;

      if (existingRegistration) {
        throw new Error("You are already registered for this event.");
      }

      const nextAttendeeCount = event.attendeeCount + 1;
      const nextStatus = nextAttendeeCount >= event.capacity ? "FULL" : "OPEN";

      const reservedSeat = (await EventModel.findOneAndUpdate(
        {
          _id: event._id,
          status: "OPEN",
          attendeeCount: event.attendeeCount,
          registrationCutoff: { $gt: now }
        },
        {
          $inc: { attendeeCount: 1 },
          $set: { status: nextStatus, updatedAt: now }
        },
        { session, new: true }
      ).lean()) as Pick<Event, "_id" | "attendeeCount" | "capacity" | "status"> | null;

      if (!reservedSeat) {
        throw new Error("Unable to reserve a seat. The event may have filled up.");
      }

      const [createdRegistration] = await RegistrationModel.create(
        [
          {
            attendeeId,
            eventId: event._id,
            status: "ACTIVE",
            registeredAt: now,
            cancelledAt: null
          }
        ],
        { session }
      );

      await outboxPublisher.publishEvent(
        session,
        "REGISTRATION",
        createdRegistration._id.toString(),
        "REGISTRATION_CREATED",
        {
          registrationId: createdRegistration._id.toString(),
          attendeeId: attendeeId.toString(),
          attendeeEmail: normalizedEmail,
          attendeeName: parsed.data.name,
          eventId: event._id.toString(),
          eventTitle: event.title,
          eventSlug: event.slug,
          eventDate: event.date.toISOString(),
          eventTime: event.time
        }
      );

      registrationResult = {
        success: true,
        message:
          accountState === "created"
            ? "Your attendee account has been created and your registration is confirmed."
            : "Your existing attendee account has been reused and your registration is confirmed.",
        accountState
      };
    });

    if (!registrationResult) {
      metricsCollector.recordRegistrationFailure("legacy", "transaction_failed");
      return { success: false, message: "Unable to complete registration. Please try again." };
    }

    metricsCollector.recordRegistrationSuccess("legacy", registrationResult.accountState);
    return registrationResult;
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      metricsCollector.recordRegistrationFailure("legacy", "duplicate_registration");
      return { success: false, message: "You are already registered for this event." };
    }

    const errorReason = error instanceof Error ? error.message.toLowerCase().replace(/\s+/g, "_") : "unknown_error";
    metricsCollector.recordRegistrationFailure("legacy", errorReason);

    if (error instanceof Error) {
      return { success: false, message: error.message };
    }

    return { success: false, message: "Unable to complete registration right now." };
  } finally {
    session.endSession();
  }
}

export async function registerAttendeeForEventAtomic(
  eventSlug: string,
  formValues: AttendeeRegistrationInput
): Promise<RegistrationBusinessResult> {
  metricsCollector.recordRegistrationAttempt("atomic");

  const parsed = attendeeRegistrationSchema.safeParse(formValues);

  if (!parsed.success) {
    const message = Object.values(mapZodErrors(parsed.error)).find(Boolean) ?? "Please fix the highlighted fields.";
    metricsCollector.recordRegistrationFailure("atomic", "validation_error");
    return { success: false, message };
  }

  const normalizedEmail = parsed.data.email;
  const now = new Date();

  await connectToDatabase();

  const session = await mongoose.startSession();
  let redisSlotReserved = false;
  let usingRedisFallback = false;

  try {
    let registrationResult: RegistrationBusinessResult | null = null;

    await session.withTransaction(async () => {
      const event = (await EventModel.findOne({
        slug: eventSlug.trim().toLowerCase(),
        status: "OPEN"
      })
        .session(session)
        .select({
          _id: 1,
          title: 1,
          slug: 1,
          capacity: 1,
          attendeeCount: 1,
          registrationCutoff: 1,
          status: 1
        })
        .lean()) as
        | Pick<Event, "_id" | "title" | "slug" | "capacity" | "attendeeCount" | "registrationCutoff" | "status">
        | null;

      if (!event) {
        throw new Error("This event is not open for registration.");
      }

      if (event.registrationCutoff.getTime() <= now.getTime()) {
        throw new Error("Registration cutoff has passed.");
      }

      if (!redisSlotReserved) {
        const redisResult = await redisCheckAndDecrement(event._id.toString(), event.capacity);

        if (!redisResult.success && redisResult.error === "SOLD_OUT") {
          throw new Error("This event is sold out.");
        }

        if (!redisResult.success && redisResult.fallbackUsed) {
          usingRedisFallback = true;
          metricsCollector.recordRedisFallback(event._id.toString(), redisResult.error ?? "unknown");
        } else if (redisResult.success) {
          redisSlotReserved = true;
        }
      }

      const existingUser = (await UserModel.findOne({ email: normalizedEmail })
        .session(session)
        .select({ _id: 1, passwordHash: 1, role: 1 })
        .lean()) as (Pick<User, "_id" | "passwordHash" | "role"> | null);

      let attendeeId: mongoose.Types.ObjectId;
      let accountState: "created" | "reused";

      if (existingUser) {
        if (existingUser.role !== "ATTENDEE") {
          throw new Error("This email belongs to a host account. Use an attendee email instead.");
        }

        const passwordMatches = await bcrypt.compare(parsed.data.password, existingUser.passwordHash);

        if (!passwordMatches) {
          throw new Error("Incorrect password for the existing attendee account.");
        }

        attendeeId = existingUser._id;
        accountState = "reused";
      } else {
        const passwordHash = await bcrypt.hash(parsed.data.password, 12);
        const [createdUser] = await UserModel.create(
          [
            {
              name: parsed.data.name,
              email: normalizedEmail,
              passwordHash,
              role: "ATTENDEE"
            }
          ],
          { session }
        );

        attendeeId = createdUser._id;
        accountState = "created";
      }

      const existingRegistration = (await RegistrationModel.findOne({ eventId: event._id, attendeeId })
        .session(session)
        .select({ _id: 1 })
        .lean()) as Pick<Registration, "_id"> | null;

      if (existingRegistration) {
        throw new Error("You are already registered for this event.");
      }

      const atomicIncrementResult = await EventModel.atomicIncrementWithCapacityCheck(
        event._id,
        event.capacity,
        session
      );

      if (!atomicIncrementResult.success) {
        throw new Error("Unable to reserve a seat. The event may have filled up.");
      }

      const [createdRegistrationAtomic] = await RegistrationModel.create(
        [
          {
            attendeeId,
            eventId: event._id,
            status: "ACTIVE",
            registeredAt: now,
            cancelledAt: null
          }
        ],
        { session }
      );

      await outboxPublisher.publishEvent(
        session,
        "REGISTRATION",
        createdRegistrationAtomic._id.toString(),
        "REGISTRATION_CREATED",
        {
          registrationId: createdRegistrationAtomic._id.toString(),
          attendeeId: attendeeId.toString(),
          attendeeEmail: normalizedEmail,
          attendeeName: parsed.data.name,
          eventId: event._id.toString(),
          eventTitle: event.title,
          eventSlug: event.slug,
          eventDate: event.date.toISOString(),
          eventTime: event.time
        }
      );

      registrationResult = {
        success: true,
        message:
          accountState === "created"
            ? "Your attendee account has been created and your registration is confirmed."
            : "Your existing attendee account has been reused and your registration is confirmed.",
        accountState
      };
    });

    if (!registrationResult) {
      if (redisSlotReserved) {
        const compensateResult = await redisRollbackIncrement(eventSlug);
        metricsCollector.recordCompensationAttempt(eventSlug, compensateResult.success);
        if (!compensateResult.success) {
          console.error(`[Atomic Registration] Failed to compensate Redis for event ${eventSlug}. Manual intervention required.`);
        }
      }
      metricsCollector.recordRegistrationFailure("atomic", "transaction_failed");
      return { success: false, message: "Unable to complete registration. Please try again." };
    }

    metricsCollector.recordRegistrationSuccess("atomic", registrationResult.accountState);
    return registrationResult;
  } catch (error) {
    if (redisSlotReserved) {
      const compensateResult = await redisRollbackIncrement(eventSlug);
      metricsCollector.recordCompensationAttempt(eventSlug, compensateResult.success);
      if (!compensateResult.success) {
        console.error(`[Atomic Registration] Failed to compensate Redis for event ${eventSlug}. Manual intervention required.`);
      }
    }

    if (isDuplicateKeyError(error)) {
      metricsCollector.recordRegistrationFailure("atomic", "duplicate_registration");
      return { success: false, message: "You are already registered for this event." };
    }

    const errorReason = error instanceof Error ? error.message.toLowerCase().replace(/\s+/g, "_") : "unknown_error";
    metricsCollector.recordRegistrationFailure("atomic", errorReason);

    if (error instanceof Error) {
      return { success: false, message: error.message };
    }

    return { success: false, message: "Unable to complete registration right now." };
  } finally {
    session.endSession();
  }
}
