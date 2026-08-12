import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  AUTH_URL: z.string().url(),
  AUTH_SECRET: z.string().min(1),
  MONGODB_URI: z.string().min(1),
  MONGODB_DB: z.string().min(1),
  REDIS_URL: z.string().url().optional().default(""),
  ENABLE_ATOMIC_REGISTRATIONS: z.enum(["true", "false"]).default("false"),
  ENABLE_OUTBOX_PATTERN: z.enum(["true", "false"]).default("false"),
  OUTBOX_RELAY_ENABLED: z.enum(["true", "false"]).default("false"),
  OUTBOX_POLL_INTERVAL_MS: z.string().default("5000"),
  OUTBOX_MAX_RETRIES: z.string().default("5"),
  OUTBOX_MAX_RETRY_DELAY_MS: z.string().default("300000")
});

const parsedEnv = envSchema.safeParse({
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  AUTH_URL: process.env.AUTH_URL,
  AUTH_SECRET: process.env.AUTH_SECRET,
  MONGODB_URI: process.env.MONGODB_URI,
  MONGODB_DB: process.env.MONGODB_DB,
  REDIS_URL: process.env.REDIS_URL,
  ENABLE_ATOMIC_REGISTRATIONS: process.env.ENABLE_ATOMIC_REGISTRATIONS,
  ENABLE_OUTBOX_PATTERN: process.env.ENABLE_OUTBOX_PATTERN,
  OUTBOX_RELAY_ENABLED: process.env.OUTBOX_RELAY_ENABLED,
  OUTBOX_POLL_INTERVAL_MS: process.env.OUTBOX_POLL_INTERVAL_MS,
  OUTBOX_MAX_RETRIES: process.env.OUTBOX_MAX_RETRIES,
  OUTBOX_MAX_RETRY_DELAY_MS: process.env.OUTBOX_MAX_RETRY_DELAY_MS
});

if (!parsedEnv.success) {
  throw new Error(
    `Invalid environment configuration: ${parsedEnv.error.issues
      .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
      .join("; ")}`
  );
}

export const env = parsedEnv.data;