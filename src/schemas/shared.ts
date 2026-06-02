import { z } from "zod";

export const normalizedEmailSchema = z
  .string()
  .trim()
  .email("Enter a valid email address")
  .transform((value) => value.toLowerCase());

export const nameSchema = z
  .string()
  .trim()
  .min(2, "Name must be at least 2 characters")
  .max(100, "Name must be at most 100 characters");

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters");

export const titleSchema = z
  .string()
  .trim()
  .min(1, "Title is required")
  .max(200, "Title must be at most 200 characters");

export const descriptionSchema = z
  .string()
  .trim()
  .min(1, "Description is required")
  .max(5000, "Description must be at most 5000 characters");

export const locationSchema = z
  .string()
  .trim()
  .min(1, "Location is required")
  .max(300, "Location must be at most 300 characters");

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must contain only lowercase letters, numbers, and hyphens");

export const timeSchema = z
  .string()
  .trim()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Time must use 24-hour HH:mm format");

export const isoDateSchema = z
  .union([z.string(), z.date()])
  .transform((value) => (value instanceof Date ? value : new Date(value)));

export const positiveIntegerSchema = z
  .number({ invalid_type_error: "Must be a number" })
  .int("Must be an integer")
  .positive("Must be greater than 0");

export const nonNegativeIntegerSchema = z
  .number({ invalid_type_error: "Must be a number" })
  .int("Must be an integer")
  .min(0, "Must be at least 0");
