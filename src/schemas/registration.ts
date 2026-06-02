import { z } from "zod";

import { normalizedEmailSchema, nameSchema, passwordSchema } from "@/schemas/shared";

export const attendeeRegistrationSchema = z.object({
  name: nameSchema,
  email: normalizedEmailSchema,
  password: passwordSchema
});

export const attendeeCancellationSchema = z.object({
  registrationId: z
    .string()
    .trim()
    .min(1, "Registration id is required")
});

export type AttendeeRegistrationInput = z.infer<typeof attendeeRegistrationSchema>;
export type AttendeeCancellationInput = z.infer<typeof attendeeCancellationSchema>;
