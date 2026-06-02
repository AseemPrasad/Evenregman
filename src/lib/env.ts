import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  AUTH_URL: z.string().url(),
  AUTH_SECRET: z.string().min(1),
  MONGODB_URI: z.string().min(1),
  MONGODB_DB: z.string().min(1)
});

const parsedEnv = envSchema.safeParse({
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  AUTH_URL: process.env.AUTH_URL,
  AUTH_SECRET: process.env.AUTH_SECRET,
  MONGODB_URI: process.env.MONGODB_URI,
  MONGODB_DB: process.env.MONGODB_DB
});

if (!parsedEnv.success) {
  throw new Error(
    `Invalid environment configuration: ${parsedEnv.error.issues
      .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
      .join("; ")}`
  );
}

export const env = parsedEnv.data;