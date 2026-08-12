# Full-Stack Distributed Tracing & OpenTelemetry Instrumentation

## Overview

**OpenTelemetry (OTel)** is integrated to provide distributed tracing across the entire application stack. This enables end-to-end visibility into request flows, database queries, cache operations, and background job processing.

### Problem Solved

**Before**: No observability; diagnosing slow API requests, bottlenecks across server components, or database latencies requires scattered logs  
**After**: Complete distributed traces showing all operations (HTTP → DB → Redis → Background Jobs) with latency and error context

## Architecture

### Trace Flow

```
User Request
  ↓
HTTP Request Span (method, URL, status)
  ├─ Database Span (collection, operation, query duration)
  ├─ Cache Span (key, hit/miss, duration)
  ├─ External API Call (with traceparent header injection)
  └─ On Exception: Error attributes + stacktrace
  ↓
Background Job Span (linked via traceparent from parent)
  ├─ Batch Processing Span (item count, success/failure)
  └─ Job Result: Recorded back to trace
  ↓
OTLP Exporter
  ↓
Collector (Datadog, Honeycomb, Grafana Tempo, AWS X-Ray)
```

### Components

**Instrumentation** (`src/instrumentation.ts`):
- Next.js standard instrumentation hook
- Conditional initialization based on `ENABLE_OTEL_TRACING`
- Auto-loads instrumentations on server startup

**Core Telemetry** (`src/lib/telemetry.ts`):
- Singleton `TracerProvider` and `Tracer` instances
- Resource configuration (service name, version, environment)
- OTLP HTTP exporter setup
- Probabilistic sampling based on `OTEL_SAMPLE_RATE`
- Graceful no-op tracer when disabled

**HTTP Tracing** (`src/lib/trace-middleware.ts`):
- `withTracing()`: Wraps API route handlers
- Captures: method, URL, status code, response time
- Records exceptions with full context

**Database Tracing** (`src/lib/trace-db.ts`):
- `withDBSpan()`: Generic wrapper for database operations
- Auto-tracing via `@opentelemetry/instrumentation-mongoose`
- Captures: collection, operation type, filter/update documents, duration
- Helpers: `traceFind()`, `traceFindOne()`, `traceFindByIdAndUpdate()`, etc.

**Cache Tracing** (`src/lib/trace-cache.ts`):
- `withCacheSpan()`: Wrapper for cache operations
- Auto-tracing via `@opentelemetry/instrumentation-ioredis`
- Captures: key, operation (get/set/del), layer (L1/L2), TTL, duration
- Helpers: `traceCacheGet()`, `traceCacheSet()`, `recordCacheHit()`, `recordCacheMiss()`

**Error Handling** (`src/lib/trace-errors.ts`):
- `recordException()`: Inject error details into active span
- `withErrorTracking()`: Wrapper for exception context capture
- `TracedError`: Custom error class auto-recording to telemetry
- Captures: error type, message, stacktrace, HTTP status, user/org context

**Trace Propagation** (`src/lib/trace-propagation.ts`):
- W3C `traceparent` header injection/extraction
- `fetchWithTrace()`: Drop-in fetch replacement with auto-injection
- Context injection into job payloads
- Standard trace propagation across process boundaries

**Job Tracing** (`src/lib/trace-jobs.ts`):
- `withJobTraceContext()`: Embed parent trace in job payload
- `withJobSpan()`: Wrap background job processor
- `traceJobProcessor()`: Combined context + span wrapper
- Job event recording: queued, started, completed, failed, retry, batch metrics

## Configuration

### Environment Variables

```env
# Feature Flag
ENABLE_OTEL_TRACING=false

# Collector Configuration
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_SERVICE_NAME=evenregman
OTEL_SERVICE_VERSION=1.0.0

# Sampling & Export
OTEL_SAMPLE_RATE=1.0
OTEL_BATCH_PROCESSOR_ENABLED=true
OTEL_BATCH_SPAN_PROCESSOR_SCHEDULE_DELAY=5000
```

### Tracing Disabled (Default)

When `ENABLE_OTEL_TRACING=false`:
- `NoopTracerProvider` used
- Zero overhead (< 0.1ms per operation)
- All wrapper functions are pass-through no-ops
- Existing code paths unchanged

### Tracing Enabled

When `ENABLE_OTEL_TRACING=true`:
- SDK initializes at server startup
- Auto-instrumentations active
- Spans collected and batched
- Exported via OTLP HTTP every 5 seconds (configurable)

## Performance Impact

| Setting | Impact |
|---------|--------|
| Disabled | < 0.1ms overhead |
| Enabled (100% sample) | ~1-2ms per request (batch processor) |
| Enabled (10% sample) | ~0.2-0.5ms per request (1 in 10 traced) |

## Trace Schema

### Span Naming Conventions

```
HTTP Requests:      GET /api/events
Database:           db.find, db.findOne, db.findByIdAndUpdate, db.insertOne
Cache:              cache.get, cache.set, cache.del, cache.delPattern
Background Jobs:    job.{jobType}
Exceptions:         exception (event on HTTP or job span)
```

### Span Attributes

**HTTP Request**:
```
http.method: "GET"
http.url: "http://localhost:3000/api/events"
http.target: "/api/events"
http.scheme: "http"
http.host: "localhost"
http.status_code: 200
```

**Database**:
```
db.system: "mongodb"
db.mongodb.collection: "events"
db.operation: "find"
duration.ms: 45
```

**Cache**:
```
cache.key: "events:123"
cache.operation: "get"
cache.layer: "L1"
duration.ms: 2
```

**Background Job**:
```
job.type: "csv_export"
job.status: "success"
duration.ms: 5000
batch.total: 1000
batch.success: 995
batch.failure: 5
```

## Supported Collectors

- **Datadog**: OTLP endpoint `https://api.datadoghq.com/v1/input/`
- **Honeycomb**: OTLP endpoint `https://api.honeycomb.io`
- **Grafana Tempo**: OTLP endpoint `http://tempo:4318` (or self-hosted)
- **AWS X-Ray**: Via `@opentelemetry/exporter-trace-otlp-proto`
- **Jaeger**: Via `@opentelemetry/exporter-trace-jaeger-thrift`

## Backward Compatibility

✅ **Zero Breaking Changes**:
- Feature flag defaults to false
- Existing code paths unchanged when disabled
- Optional wrapper functions for manual tracing
- Auto-instrumentations transparent

✅ **Coexistence**:
- Can enable/disable at runtime
- Mixed tracing (some endpoints traced, others not)
- Sampling allows partial tracing in high-volume environments

## Use Cases

### 1. Slow API Requests
Query: Find all requests taking > 1 second
```
span.name = "GET /api/events"
AND span.duration_ms > 1000
```
Result: See which child spans (DB, cache, external API) caused latency

### 2. Database Query Performance
Query: List all MongoDB queries
```
span.name = "db.*"
ORDER BY span.duration_ms DESC
```
Result: Identify slow queries, n+1 problems

### 3. Cache Hit Rate
Query: Cache operations by hit/miss
```
span.name = "cache.*"
GROUP BY cache.hit
```
Result: Monitor cache effectiveness

### 4. Background Job Failures
Query: Failed job traces
```
span.status_code = ERROR
AND span.name = "job.*"
```
Result: See job type, error, stacktrace, duration before failure

### 5. Distributed Trace (Request to Job)
Query: Trace by traceparent
```
traceparent = "00-xxx-yyy-01"
```
Result: Full path from HTTP request → DB → Cache → Background Job

## Best Practices

1. **Sampling in Production**: Use `OTEL_SAMPLE_RATE=0.1` (10%) or lower to control trace volume
2. **Use Meaningful Operation Names**: `withTracing(handler, 'POST /api/events/import')`
3. **Add User Context**: Call `setErrorContext(userId, orgId)` on authenticated requests
4. **Link Background Jobs**: Use `injectTraceContextToJobPayload()` to link to parent request
5. **Monitor Exporter Health**: Check logs for `[OTel]` errors or gaps in trace export

## References

- [[OTEL_DEPLOYMENT.md]] — Rollout strategy & phased enablement
- [[OTEL_MIGRATION_GUIDE.md]] — Adding tracing to custom code
- [OpenTelemetry Docs](https://opentelemetry.io/docs/)
- [W3C Trace Context](https://www.w3.org/TR/trace-context/)
