# OpenTelemetry Migration Guide

## Adding Distributed Tracing to Your Code

This guide shows how to add custom trace spans to server actions, database queries, and background jobs.

---

## Quick Start: HTTP Request Tracing

### Wrap an API Route Handler

**Before**:
```typescript
export async function GET(req: Request) {
  const events = await EventModel.find({});
  return Response.json(events);
}
```

**After**:
```typescript
import { withTracing } from '@/lib/trace-middleware';

async function handler(req: Request) {
  const events = await EventModel.find({});
  return Response.json(events);
}

export const GET = withTracing(handler, 'GET /api/events');
```

**What it captures**:
- HTTP method, URL, status code
- Request duration
- Exceptions with full stacktrace

---

## Tracing Database Queries

### Manual Tracing for Complex Queries

**Before**:
```typescript
const user = await UserModel.findById(userId);
const updated = await UserModel.findByIdAndUpdate(userId, { lastLogin: new Date() });
```

**After**:
```typescript
import { traceFindOne, traceFindByIdAndUpdate } from '@/lib/trace-db';

const user = await traceFindOne('User', { _id: userId }, () =>
  UserModel.findById(userId)
);

const updated = await traceFindByIdAndUpdate(
  'User',
  userId,
  { lastLogin: new Date() },
  () => UserModel.findByIdAndUpdate(userId, { lastLogin: new Date() })
);
```

**Available Helpers**:
- `traceFind(collection, filter, callback)`
- `traceFindOne(collection, filter, callback)`
- `traceFindByIdAndUpdate(collection, id, update, callback)`
- `traceInsertOne(collection, document, callback)`
- `traceDeleteMany(collection, filter, callback)`
- `withDBSpan(operationName, context, callback)` — generic

**What it captures**:
- Collection name
- Operation type (find, update, insert, delete)
- Filter/update documents
- Query duration
- Success/error status

---

## Tracing Cache Operations

### Record Cache Hits and Misses

**Before**:
```typescript
const cached = cacheService.get(eventId);
if (cached) {
  return cached;
}

const event = await EventModel.findById(eventId);
cacheService.set(eventId, event, 3600);
return event;
```

**After**:
```typescript
import { traceCacheGet, traceCacheSet, recordCacheHit, recordCacheMiss } from '@/lib/trace-cache';

const cached = await traceCacheGet(eventId, () => cacheService.get(eventId), 'L2');
if (cached) {
  recordCacheHit(eventId, 'L2');
  return cached;
}

recordCacheMiss(eventId, 'L2');
const event = await EventModel.findById(eventId);
await traceCacheSet(eventId, 3600, () => cacheService.set(eventId, event, 3600), 'L2');
return event;
```

**Available Helpers**:
- `traceCacheGet(key, callback, layer='L1')`
- `traceCacheSet(key, ttl, callback, layer='L1')`
- `traceCacheDel(key, callback, layer='L1')`
- `recordCacheHit(key, layer='L1')`
- `recordCacheMiss(key, layer='L1')`

**What it captures**:
- Cache key
- Hit/miss status
- Cache layer (L1/L2)
- Operation duration

---

## Tracing Background Jobs

### Link Background Job to Parent Request

**Before**:
```typescript
// In API handler
const job = await queue.add('csv-export', {
  eventId,
  filters,
});

return Response.json({ jobId: job.id }, { status: 202 });
```

**After**:
```typescript
import { withJobTraceContext } from '@/lib/trace-jobs';

// In API handler
const jobPayload = withJobTraceContext({
  eventId,
  filters,
});

const job = await queue.add('csv-export', jobPayload);

return Response.json({ jobId: job.id }, { status: 202 });
```

**What it captures**:
- Parent HTTP request linked to background job via `traceparent`
- Job type and status
- Job duration
- Success/failure

### Trace Job Processor

**Before**:
```typescript
// In job worker
worker.process('csv-export', async (job) => {
  const events = await EventModel.find(job.data.filters);
  const csv = convertToCSV(events);
  await uploadToS3(csv);
});
```

**After**:
```typescript
import { traceJobProcessor } from '@/lib/trace-jobs';

// In job worker
worker.process('csv-export', async (job) => {
  return traceJobProcessor(job.data, 'csv-export', async () => {
    const events = await EventModel.find(job.data.filters);
    const csv = convertToCSV(events);
    await uploadToS3(csv);
  });
});
```

**What it captures**:
- Job type, status, duration
- Linked to parent HTTP request trace
- Success/failure status
- All child operations (DB, S3) appear as nested spans

### Record Job Events

**For batch processing**:
```typescript
import { recordJobBatchEvent } from '@/lib/trace-jobs';

let successCount = 0;
let failureCount = 0;

for (const item of items) {
  try {
    await processItem(item);
    successCount++;
  } catch (err) {
    failureCount++;
  }
}

recordJobBatchEvent('data-import', items.length, successCount, failureCount);
```

---

## Tracing Outbound API Calls

### Use fetchWithTrace for External APIs

**Before**:
```typescript
const response = await fetch('https://api.example.com/data', {
  headers: { 'Authorization': `Bearer ${token}` },
});
```

**After**:
```typescript
import { fetchWithTrace } from '@/lib/trace-propagation';

const response = await fetchWithTrace('https://api.example.com/data', {
  headers: { 'Authorization': `Bearer ${token}` },
});
```

**What it captures**:
- Automatic `traceparent` header injection
- Remote service receives trace context
- Request/response latency
- Error status if call fails

---

## Error Tracing

### Record Exceptions

**Before**:
```typescript
export async function GET(req: Request) {
  try {
    const data = await fetchData();
    return Response.json(data);
  } catch (error) {
    console.error('Error:', error);
    return Response.json({ error: 'Internal error' }, { status: 500 });
  }
}
```

**After**:
```typescript
import { recordException, setErrorContext } from '@/lib/trace-errors';

export async function GET(req: Request) {
  try {
    const session = await auth();
    setErrorContext(session?.user?.id, session?.user?.orgId);
    
    const data = await fetchData();
    return Response.json(data);
  } catch (error) {
    recordException(error, { statusCode: 500 });
    console.error('Error:', error);
    return Response.json({ error: 'Internal error' }, { status: 500 });
  }
}
```

**What it captures**:
- Error type, message, stacktrace
- User and organization context
- HTTP status code
- Request operation name

### Use TracedError

**Before**:
```typescript
throw new Error('User not found');
```

**After**:
```typescript
import { TracedError } from '@/lib/trace-errors';

throw new TracedError('User not found', 'USER_NOT_FOUND', 404, userId, orgId);
```

---

## Advanced: Custom Spans

### Create Arbitrary Spans

```typescript
import { getTracer } from '@/lib/telemetry';
import { SpanStatusCode } from '@opentelemetry/api';

async function processLargeDataset(items: any[]) {
  const tracer = getTracer();

  return tracer.startActiveSpan('dataset.process', async (span) => {
    try {
      span.setAttributes({
        'dataset.size': items.length,
        'dataset.type': 'events',
      });

      let processed = 0;
      for (const item of items) {
        await processItem(item);
        processed++;

        if (processed % 100 === 0) {
          span.addEvent('dataset.progress', {
            'processed.count': processed,
            'remaining.count': items.length - processed,
          });
        }
      }

      span.setStatus({ code: SpanStatusCode.OK });
      return processed;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  });
}
```

---

## Migration Checklist

**Phase 1: API Routes**
- [ ] Wrap high-traffic endpoints with `withTracing()`
- [ ] Test traces appear in collector
- [ ] Monitor latency impact

**Phase 2: Database**
- [ ] Add tracing to complex queries
- [ ] Document query patterns
- [ ] Identify slow queries from traces

**Phase 3: Cache**
- [ ] Record cache hits/misses
- [ ] Analyze cache effectiveness
- [ ] Tune TTLs based on hit rates

**Phase 4: Background Jobs**
- [ ] Link jobs to parent requests via trace context
- [ ] Trace job processors
- [ ] Record batch metrics

**Phase 5: External Calls**
- [ ] Use `fetchWithTrace()` for API calls
- [ ] Verify trace propagation to external services
- [ ] Monitor external service latency

**Phase 6: Error Handling**
- [ ] Record exceptions in critical paths
- [ ] Add user/org context to errors
- [ ] Use `TracedError` for business logic errors

---

## Querying Traces

### Example Queries (Datadog)

```
# Find slow requests
service:evenregman span.name:"GET /api/events" span.duration:>1s

# Database queries by operation
service:evenregman span.name:"db.*" | stats avg(span.duration) by span.name

# Cache hit rate
service:evenregman span.name:"cache.*" | stats count by cache.hit

# Errors with user context
service:evenregman span.status:error | stats count by user.id
```

### Example Queries (Honeycomb)

```
# Latency by endpoint
BREAKDOWN BY http.url CALCULATE p50(duration_ms), p95(duration_ms), p99(duration_ms)

# Database performance
WHERE span.name = "db.*" CALCULATE avg(duration_ms) GROUP BY db.operation

# Background job failures
WHERE span.name = "job.*" AND span.status = "error" CALCULATE count() GROUP BY job.type
```

---

## Performance Tips

1. **Use Sampling**: Don't trace 100% in production
   ```env
   OTEL_SAMPLE_RATE=0.1  # 10% sampling
   ```

2. **Batch Processor**: Efficient export
   ```env
   OTEL_BATCH_PROCESSOR_ENABLED=true
   OTEL_BATCH_SPAN_PROCESSOR_SCHEDULE_DELAY=5000
   ```

3. **Conditional Tracing**: Skip expensive traces if not sampled
   ```typescript
   if (!env.ENABLE_OTEL_TRACING) {
     return fetch(url, init);
   }
   ```

4. **Meaningful Names**: Use operation names that enable aggregation
   ```typescript
   withTracing(handler, 'POST /api/events/import')  // ✅ Good
   withTracing(handler, `POST /api/events/${id}`)   // ❌ Bad (too granular)
   ```

---

## Troubleshooting

### Traces Not Appearing

1. Verify `ENABLE_OTEL_TRACING=true`
2. Check collector is running: `curl http://localhost:4318/`
3. Look for `[OTel]` errors in logs
4. Check sampling: `OTEL_SAMPLE_RATE` might be 0

### High Overhead

- Reduce sampling rate
- Check collector latency
- Verify network connectivity
- Profile with `OTEL_BATCH_PROCESSOR_ENABLED=true`

### Missing Child Spans

- Ensure parent span is active: use `startActiveSpan()` not `startSpan()`
- Child operations run within the parent span context
- Use nested async/await to maintain context

---

## References

- [[OTEL_ARCHITECTURE.md]] — System design
- [[OTEL_DEPLOYMENT.md]] — Rollout strategy
- [OpenTelemetry JS Docs](https://opentelemetry.io/docs/instrumentation/js/)
- [Trace Context Spec](https://www.w3.org/TR/trace-context/)
