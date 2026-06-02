import { z } from "zod";

import { nameSchema, normalizedEmailSchema, passwordSchema } from "@/schemas/shared";

export const hostSignupSchema = z.object({
  name: nameSchema,
  email: normalizedEmailSchema,
  password: passwordSchema
});

export const loginSchema = z.object({
  email: normalizedEmailSchema,
  password: passwordSchema
});

export type HostSignupInput = z.infer<typeof hostSignupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
