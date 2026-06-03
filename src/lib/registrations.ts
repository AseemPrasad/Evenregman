import "server-only";

import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { isValidObjectId } from "mongoose";

import { connectToDatabase } from "@/lib/db";
import { EventModel, type Event } from "@/models/Event";
import { RegistrationModel, type Registration } from "@/models/Registration";
import { UserModel, type User } from "@/models/User";
import { attendeeRegistrationSchema, type AttendeeRegistrationInput } from "@/schemas/registration";

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
  const parsed = attendeeRegistrationSchema.safeParse(formValues);

  if (!parsed.success) {
    const message = Object.values(mapZodErrors(parsed.error)).find(Boolean) ?? "Please fix the highlighted fields.";
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

      await RegistrationModel.create(
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
      return { success: false, message: "Unable to complete registration. Please try again." };
    }

    return registrationResult;
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return { success: false, message: "You are already registered for this event." };
    }

    if (error instanceof Error) {
      return { success: false, message: error.message };
    }

    return { success: false, message: "Unable to complete registration right now." };
  } finally {
    session.endSession();
  }
}
