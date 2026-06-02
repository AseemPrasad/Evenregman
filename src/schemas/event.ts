import { z } from "zod";

import {
  descriptionSchema,
  isoDateSchema,
  locationSchema,
  positiveIntegerSchema,
  slugSchema,
  timeSchema,
  titleSchema
} from "@/schemas/shared";

const eventBaseSchema = z.object({
  title: titleSchema,
  description: descriptionSchema,
  date: isoDateSchema,
  time: timeSchema,
  location: locationSchema,
  capacity: positiveIntegerSchema,
  registrationCutoff: isoDateSchema,
  slug: slugSchema.optional()
});

export const eventCreationSchema = eventBaseSchema.superRefine((value, context) => {
  if (value.registrationCutoff.getTime() <= Date.now()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["registrationCutoff"],
      message: "Registration cutoff must be in the future"
    });
  }
});

export const eventUpdateSchema = eventBaseSchema
  .partial()
  .extend({
    capacity: positiveIntegerSchema.optional()
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "At least one field must be provided for update"
  })
  .superRefine((value, context) => {
    if (value.registrationCutoff && value.registrationCutoff.getTime() <= Date.now()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["registrationCutoff"],
        message: "Registration cutoff must be in the future"
      });
    }
  });

export type EventCreationInput = z.infer<typeof eventCreationSchema>;
export type EventUpdateInput = z.infer<typeof eventUpdateSchema>;
