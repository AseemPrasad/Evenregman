"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { registerAttendeeForEvent, registerAttendeeForEventAtomic } from "@/lib/registrations";
import { attendeeRegistrationSchema } from "@/schemas/registration";
import { env } from "@/lib/env";

export type AttendeeRegistrationFormValues = z.infer<typeof attendeeRegistrationSchema>;

export type AttendeeRegistrationState = {
  success: boolean;
  message?: string;
  accountState?: "created" | "reused";
  fieldErrors?: Partial<Record<keyof AttendeeRegistrationFormValues, string>>;
};

function mapZodErrors(error: z.ZodError<AttendeeRegistrationFormValues>) {
  const fieldErrors: Partial<Record<keyof AttendeeRegistrationFormValues, string>> = {};

  for (const issue of error.issues) {
    const field = issue.path[0] as keyof AttendeeRegistrationFormValues | undefined;

    if (field && !fieldErrors[field]) {
      fieldErrors[field] = issue.message;
    }
  }

  return fieldErrors;
}

export async function registerForEventAction(
  eventSlug: string,
  _previousState: AttendeeRegistrationState,
  formValues: AttendeeRegistrationFormValues
): Promise<AttendeeRegistrationState> {
  const parsed = attendeeRegistrationSchema.safeParse(formValues);

  if (!parsed.success) {
    return {
      success: false,
      message: "Please fix the highlighted fields.",
      fieldErrors: mapZodErrors(parsed.error)
    };
  }

  const isAtomicEnabled = env.ENABLE_ATOMIC_REGISTRATIONS === "true";
  const registrationFn = isAtomicEnabled ? registerAttendeeForEventAtomic : registerAttendeeForEvent;

  const result = await registrationFn(eventSlug, parsed.data);

  if (result.success) {
    revalidatePath(`/events/${eventSlug}`);
  }

  return result;
}
