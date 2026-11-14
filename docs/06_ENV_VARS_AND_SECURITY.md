# 🔐 Master Environment Variables & Security Matrix

This document provides an exhaustive, production-grade reference for all configuration options defined in `src/lib/env.ts`, their expected types, fallbacks, and security implications.

---

## 1. Master Environment Variables Matrix

| Variable Name | Type / Allowed | Default | Required? | Subsystem | Description & Production Guidance |
|---|---|---|---|---|---|
| `NODE_ENV` | `"development"` \| `"test"` \| `"production"` | `"development"` | No | Core | Sets Node.js optimization mode. Set to `"production"` in live deployments. |
| `NEXT_PUBLIC_APP_URL` | String (URL) | `http://localhost:3000` | No | Web | Base canonical URL of the application. Used for absolute redirects and email links. |
| `AUTH_URL` | String (URL) | `http://localhost:3000` | No | Auth | NextAuth v5 canonical endpoint base. |
| `AUTH_SECRET` | String (min 32 chars) | — | **YES** | Auth | Cryptographic secret used to sign and encrypt session JWTs and cookies. |
| `MONGODB_URI` | String (URI) | — | **YES** | Database | MongoDB connection string. Must include `?replicaSet=...` in production. |
| `MONGODB_DB` | String | — | **YES** | Database | Target database name (e.g. `evenregman_prod`). |
| `REDIS_URL` | String (URL) | `""` | No | Redis | Redis connection string (e.g. `redis://default:pass@redis-host:6379`). |
| `ENABLE_ATOMIC_REGISTRATIONS`| `"true"` \| `"false"` | `"false"` | No | Concurrency | Activates Redis Lua atomic fast-path. **Set to `"true"` in production**. |
| `ENABLE_OUTBOX_PATTERN` | `"true"` \| `"false"` | `"false"` | No | Outbox | Enables transactional outbox event publishing. **Set to `"true"` in production**. |
| `OUTBOX_RELAY_ENABLED` | `"true"` \| `"false"` | `"false"` | No | Outbox | Starts the background outbox polling loop in worker containers. |
| `OUTBOX_POLL_INTERVAL_MS` | String (number) | `"5000"` | No | Outbox | Polling frequency in milliseconds for the outbox relay daemon. |
| `OUTBOX_MAX_RETRIES` | String (number) | `"5"` | No | Outbox | Maximum retries before moving a failed event to dead-letter state. |
| `OUTBOX_MAX_RETRY_DELAY_MS` | String (number) | `"300000"` | No | Outbox | Maximum delay cap for exponential backoff (default: 5 minutes). |
| `ENABLE_RATE_LIMITING` | `"true"` \| `"false"` | `"false"` | No | Security | Activates sliding-window rate limiters on public and auth endpoints. |
| `RATE_LIMIT_STRICT_MODE` | `"true"` \| `"false"` | `"false"` | No | Security | When `"true"`, immediately returns HTTP 429 when limits are breached. |
| `ENABLE_ASYNC_EXPORTS` | `"true"` \| `"false"` | `"false"` | No | S3 / Jobs | Enables background CSV generation and streaming to S3. |
| `ASYNC_EXPORTS_WORKER_ENABLED`| `"true"` \| `"false"` | `"false"` | No | S3 / Jobs | Enables the BullMQ/Redis export worker daemon in worker containers. |
| `S3_BUCKET_NAME` | String | `""` | Optional | AWS S3 | Target Amazon S3 bucket for CSV exports. |
| `S3_REGION` | String | `"auto"` | Optional | AWS S3 | AWS region for S3 client (e.g. `us-east-1`). |
| `AWS_ACCESS_KEY_ID` | String | `""` | Optional | AWS S3 | IAM access key with `s3:PutObject` and `s3:GetObject` permissions. |
| `AWS_SECRET_ACCESS_KEY` | String | `""` | Optional | AWS S3 | IAM secret access key. |
| `ENABLE_RBAC_ENGINE` | `"true"` \| `"false"` | `"false"` | No | Security | Enables fine-grained role-based and attribute-based access control. |
| `RBAC_AUTO_BOOTSTRAP_ORGS` | `"true"` \| `"false"` | `"true"` | No | Security | Automatically creates tenant organizations on first host registration. |
| `RBAC_AUDIT_RETENTION_DAYS` | String (number) | `"2555"` | No | Security | Audit log retention period (default: 7 years for enterprise compliance). |
| `RBAC_LOG_SENSITIVE_ACTIONS`| `"true"` \| `"false"` | `"false"` | No | Security | Logs payload diffs on sensitive admin mutations. |
| `ENABLE_L2_CACHE` | `"true"` \| `"false"` | `"false"` | No | Cache | Activates distributed Redis L2 cache for public event pages. |
| `CACHE_TTL_EVENTS` | String (number) | `"3600"` | No | Cache | L2 Redis cache TTL in seconds for individual event metadata. |
| `CACHE_TTL_EVENTS_LIST` | String (number) | `"300"` | No | Cache | L2 Redis cache TTL in seconds for public event directory queries. |
| `CACHE_COMPRESSION_ENABLED` | `"true"` \| `"false"` | `"true"` | No | Cache | Gzips cached Redis payloads exceeding threshold bytes. |
| `CACHE_COMPRESSION_THRESHOLD_BYTES`| String (number) | `"1024"` | No | Cache | Minimum byte size before applying gzip compression in Redis. |
| `ENABLE_ENTERPRISE_SSO` | `"true"` \| `"false"` | `"false"` | No | Enterprise | Enables SAML 2.0 and OIDC federated single sign-on routes. |
| `SAML_STRICT` | `"true"` \| `"false"` | `"true"` | No | Enterprise | Enforces strict XML signature and timestamp validation on SAML assertions. |
| `OIDC_TIMEOUT_SECONDS` | String (number) | `"30"` | No | Enterprise | Network timeout for external Identity Provider discovery endpoints. |
| `SCIM_RATE_LIMIT` | String (number) | `"100"` | No | Enterprise | Maximum allowed SCIM API requests per minute per tenant. |
| `SESSION_REVOCATION_ENABLED`| `"true"` \| `"false"` | `"true"` | No | Auth | Tracks revoked JWT sessions in Redis for instant enterprise kill-switch. |
| `SESSION_REVOCATION_TTL_HOURS`| String (number) | `"168"` | No | Auth | Sliding window for revoked session retention in Redis (7 days). |
| `ENABLE_CDC_PIPELINE` | `"true"` \| `"false"` | `"false"` | No | Analytics | Enables Change Data Capture stream listening. |
| `CDC_PIPELINE_WORKER_ENABLED`| `"true"` \| `"false"` | `"false"` | No | Analytics | Activates the CDC projection runner daemon in the worker container. |
| `CDC_BATCH_SIZE` | String (number) | `"100"` | No | Analytics | Number of change stream events batched before flushing projections. |
| `CDC_BATCH_INTERVAL_MS` | String (number) | `"5000"` | No | Analytics | Maximum time window before flushing partial CDC batches. |
| `CDC_RESUME_TOKEN_STORAGE` | `"redis"` \| `"mongodb"` | `"redis"` | No | Analytics | Location where change stream resume tokens are stored. |
| `ENABLE_OTEL_TRACING` | `"true"` \| `"false"` | `"false"` | No | Telemetry | Activates OpenTelemetry auto-instrumentation hooks. |
| `OTEL_EXPORTER_OTLP_ENDPOINT`| String (URL) | `http://localhost:4318/v1/traces` | No | Telemetry | OpenTelemetry collector HTTP endpoint. |
| `ENABLE_EMAIL_DISPATCH` | `"true"` \| `"false"` | `"false"` | No | Email | Activates real outbound SMTP email delivery in outbox handlers. |
| `EMAIL_FROM` | String | `"noreply@resmesh.io"` | No | Email | Verified sender address in outbound email headers. |
| `EMAIL_SERVER_HOST` | String | `""` | Optional | Email | SMTP relay host (e.g. `smtp.resend.com` or `smtp.sendgrid.net`). |
| `EMAIL_SERVER_PORT` | String | `"587"` | No | Email | SMTP relay port (`587` for STARTTLS, `465` for SSL). |
| `EMAIL_SERVER_USER` | String | `""` | Optional | Email | SMTP username. |
| `EMAIL_SERVER_PASSWORD` | String | `""` | Optional | Email | SMTP password or API token. |
| `ENABLE_STRIPE_BILLING` | `"true"` \| `"false"` | `"false"` | No | Billing | Activates Stripe metered usage reporting and webhook processing. |
| `STRIPE_SECRET_KEY` | String | `""` | Optional | Billing | Stripe restricted API secret key (`sk_live_...`). |
| `STRIPE_WEBHOOK_SECRET` | String | `""` | Optional | Billing | Stripe webhook signing secret (`whsec_...`). |

---

## 2. Security & RBAC Permission Matrix

The application implements a 4-tier Role-Based Access Control (RBAC) model with Organization-level isolation:

| Permission / Action | Public / Anonymous | Attendee | Host (Organizer) | Enterprise Admin |
|---|:---:|:---:|:---:|:---:|
| View Public Event Listings (`/events`) | ✅ | ✅ | ✅ | ✅ |
| Register for Event (`/events/[slug]`) | ✅ | ✅ | ❌ (Role Isolation) | ✅ |
| Cancel Own Registration (`/attendee/dashboard`) | ❌ | ✅ | ❌ | ✅ |
| Create New Event (`/host/events/new`) | ❌ | ❌ | ✅ | ✅ |
| Edit Event Capacity / Date (`/host/events/[id]/edit`) | ❌ | ❌ | ✅ (Owned Events) | ✅ |
| Revoke Attendee Ticket (`DELETE /api/host/...`) | ❌ | ❌ | ✅ (Owned Events) | ✅ |
| Trigger Async CSV Export (`/api/host/.../export`) | ❌ | ❌ | ✅ (Owned Events) | ✅ |
| Acquire ResMesh Compute Lease (`/mesh/leases`) | ❌ | ✅ | ✅ | ✅ |
| Release / Extend Compute Lease (`/mesh/leases`) | ❌ | ✅ (Owned Leases) | ✅ (Owned Leases) | ✅ |
| Configure Enterprise SCIM / SSO (`/api/scim/...`) | ❌ | ❌ | ❌ | ✅ |

