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
  OUTBOX_MAX_RETRY_DELAY_MS: z.string().default("300000"),
  ENABLE_RATE_LIMITING: z.enum(["true", "false"]).default("false"),
  RATE_LIMIT_STRICT_MODE: z.enum(["true", "false"]).default("false"),
  ENABLE_ASYNC_EXPORTS: z.enum(["true", "false"]).default("false"),
  ASYNC_EXPORTS_WORKER_ENABLED: z.enum(["true", "false"]).default("false"),
  S3_BUCKET_NAME: z.string().optional().default(""),
  S3_REGION: z.string().optional().default("auto"),
  AWS_ACCESS_KEY_ID: z.string().optional().default(""),
  AWS_SECRET_ACCESS_KEY: z.string().optional().default(""),
  ENABLE_RBAC_ENGINE: z.enum(["true", "false"]).default("false"),
  RBAC_AUTO_BOOTSTRAP_ORGS: z.enum(["true", "false"]).default("true"),
  RBAC_AUDIT_RETENTION_DAYS: z.string().default("2555"),
  RBAC_LOG_SENSITIVE_ACTIONS: z.enum(["true", "false"]).default("false"),
  ENABLE_L2_CACHE: z.enum(["true", "false"]).default("false"),
  CACHE_TTL_EVENTS: z.string().default("3600"),
  CACHE_TTL_EVENTS_LIST: z.string().default("300"),
  CACHE_COMPRESSION_ENABLED: z.enum(["true", "false"]).default("true"),
  CACHE_COMPRESSION_THRESHOLD_BYTES: z.string().default("1024"),
  ENABLE_ENTERPRISE_SSO: z.enum(["true", "false"]).default("false"),
  SAML_STRICT: z.enum(["true", "false"]).default("true"),
  OIDC_TIMEOUT_SECONDS: z.string().default("30"),
  SCIM_RATE_LIMIT: z.string().default("100"),
  SESSION_REVOCATION_ENABLED: z.enum(["true", "false"]).default("true"),
  SESSION_REVOCATION_TTL_HOURS: z.string().default("168")
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
  OUTBOX_MAX_RETRY_DELAY_MS: process.env.OUTBOX_MAX_RETRY_DELAY_MS,
  ENABLE_RATE_LIMITING: process.env.ENABLE_RATE_LIMITING,
  RATE_LIMIT_STRICT_MODE: process.env.RATE_LIMIT_STRICT_MODE,
  ENABLE_ASYNC_EXPORTS: process.env.ENABLE_ASYNC_EXPORTS,
  ASYNC_EXPORTS_WORKER_ENABLED: process.env.ASYNC_EXPORTS_WORKER_ENABLED,
  S3_BUCKET_NAME: process.env.S3_BUCKET_NAME,
  S3_REGION: process.env.S3_REGION,
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
  ENABLE_RBAC_ENGINE: process.env.ENABLE_RBAC_ENGINE,
  RBAC_AUTO_BOOTSTRAP_ORGS: process.env.RBAC_AUTO_BOOTSTRAP_ORGS,
  RBAC_AUDIT_RETENTION_DAYS: process.env.RBAC_AUDIT_RETENTION_DAYS,
  RBAC_LOG_SENSITIVE_ACTIONS: process.env.RBAC_LOG_SENSITIVE_ACTIONS,
  ENABLE_L2_CACHE: process.env.ENABLE_L2_CACHE,
  CACHE_TTL_EVENTS: process.env.CACHE_TTL_EVENTS,
  CACHE_TTL_EVENTS_LIST: process.env.CACHE_TTL_EVENTS_LIST,
  CACHE_COMPRESSION_ENABLED: process.env.CACHE_COMPRESSION_ENABLED,
  CACHE_COMPRESSION_THRESHOLD_BYTES: process.env.CACHE_COMPRESSION_THRESHOLD_BYTES,
  ENABLE_ENTERPRISE_SSO: process.env.ENABLE_ENTERPRISE_SSO,
  SAML_STRICT: process.env.SAML_STRICT,
  OIDC_TIMEOUT_SECONDS: process.env.OIDC_TIMEOUT_SECONDS,
  SCIM_RATE_LIMIT: process.env.SCIM_RATE_LIMIT,
  SESSION_REVOCATION_ENABLED: process.env.SESSION_REVOCATION_ENABLED,
  SESSION_REVOCATION_TTL_HOURS: process.env.SESSION_REVOCATION_TTL_HOURS
});

if (!parsedEnv.success) {
  throw new Error(
    `Invalid environment configuration: ${parsedEnv.error.issues
      .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
      .join("; ")}`
  );
}

export const env = parsedEnv.data;