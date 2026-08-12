# Transactional Outbox Pattern

## Overview

The **Transactional Outbox Pattern** decouples state persistence from side-effect execution. Domain events are written to an `OutboxEvent` collection within the same MongoDB transaction as the business operation, then processed asynchronously by a background worker.

### Problem Solved

**Before**: Side effects (emails, notifications) are invoked directly in request handlers. If the external API fails, either the HTTP request fails after DB write succeeds, or the side effect is lost entirely.

**After**: Events are persisted atomically with business data. A separate worker processes them asynchronously, ensuring side effects execute at-least-once without blocking requests.

## Architecture

### Two-Step Flow

```
Request Handler (HTTP)
    ↓
1. Write State + Outbox Event (atomic transaction)
    ├─ Create Registration
    ├─ Increment Event count
    └─ Create OutboxEvent (PENDING)
    ↓
Return success to client immediately
    ↓

Worker Process (background)
    ↓
2. Poll OutboxEvent (PENDING → PROCESSING)
    ├─ Find event with status=PENDING
    ├─ Atomically set status=PROCESSING
    ├─ Dispatch to handler
    ├─ Handler executes side effect (email, notification, etc.)
    └─ Update status=COMPLETED or retry
```

### Atomicity Guarantee

```typescript
// Inside MongoDB transaction
await session.withTransaction(async () => {
  // 1. Business operation
  const registration = await Registration.create([...], { session })
  await Event.updateOne({...}, { session })
  
  // 2. Event emission (same transaction)
  await OutboxEvent.create([{
    aggregateType: "REGISTRATION",
    aggregateId: registration._id.toString(),
    eventType: "REGISTRATION_CREATED",
    payload: {...},
    status: "PENDING"
  }], { session })
  
  // Either all 3 succeed or all roll back
})
```

## OutboxEvent Schema

```typescript
{
  _id: ObjectId
  aggregateType: "EVENT" | "REGISTRATION" | "USER"
  aggregateId: string (ObjectId stringified)
  eventType: string ("REGISTRATION_CREATED", etc.)
  payload: Record<string, unknown> (event-specific data)
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED"
  retryCount: number (0-5)
  scheduledAt: Date (when to process; updated for retries)
  processedAt: Date | null (when completed/failed)
  error: string | null (failure reason)
  createdAt: Date
  updatedAt: Date
}

Indexes:
- { status: 1, scheduledAt: 1 } (for polling)
- { aggregateType: 1, aggregateId: 1 } (for queries)
```

## Components

### 1. OutboxPublisher (`src/lib/outbox.ts`)

Emits events within transactions:

```typescript
await outboxPublisher.publishEvent(
  session,                    // MongoDB session
  "REGISTRATION",            // aggregateType
  registrationId,            // aggregateId
  "REGISTRATION_CREATED",    // eventType
  {                          // payload
    registrationId,
    attendeeEmail,
    eventTitle
  }
)
```

**Behavior**:
- If `ENABLE_OUTBOX_PATTERN=false`: No-op (graceful disabling)
- Creates `OutboxEvent` with status `PENDING`
- Writes within provided session (atomicity guarantee)
- Returns `{ success: true, eventId }`

### 2. Event Handler Registry (`src/workers/event-handlers/registry.ts`)

Routes events to handlers:

```typescript
class EventHandler {
  readonly eventType = "REGISTRATION_CREATED"
  async handle(event: OutboxEvent) {
    // Send email, call API, trigger notifications, etc.
  }
}

// Registry dispatches by eventType
await eventHandlerRegistry.handle(event)
```

**Handlers**:
- Must be idempotent (safe to replay)
- Receive full `OutboxEvent` object
- Can throw errors (trigger retries)
- Execute within worker process

### 3. Outbox Relay Worker (`src/workers/outbox-relay.ts`)

Polls and processes events:

```
1. Poll every 5 seconds for PENDING events
2. Atomically find-and-update: PENDING → PROCESSING
3. Invoke event handler
4. On success:   status = COMPLETED, processedAt = now
5. On failure:   status = PENDING, scheduledAt += backoff, retryCount++
6. After 5 retries: status = FAILED, log critical error
```

**Backoff Formula**:
```
delay = Math.min(2^retryCount * 1000, 300000)
```
- Retry 1: 2 seconds
- Retry 2: 4 seconds
- Retry 3: 8 seconds
- Retry 4: 16 seconds
- Retry 5: 32 seconds

## Configuration

### Environment Variables

```env
# Enable outbox pattern
ENABLE_OUTBOX_PATTERN=true

# Enable worker process in production
OUTBOX_RELAY_ENABLED=true

# Worker configuration
OUTBOX_POLL_INTERVAL_MS=5000        # Poll frequency
OUTBOX_MAX_RETRIES=5                # Attempts before FAILED
OUTBOX_MAX_RETRY_DELAY_MS=300000    # Max backoff (5 min)
```

### Default Behavior

- All flags default to `false` (disabled)
- Outbox events only created if `ENABLE_OUTBOX_PATTERN=true`
- Worker only starts if `OUTBOX_RELAY_ENABLED=true`
- Existing registrations unaffected if disabled

## Usage

### 1. Enable Outbox Events

```env
ENABLE_OUTBOX_PATTERN=true
```

Events now created atomically with registrations.

### 2. Implement Handler

```typescript
// src/workers/event-handlers/registration-created.ts
export class RegistrationCreatedHandler implements EventHandler {
  readonly eventType = "REGISTRATION_CREATED"

  async handle(event: OutboxEvent) {
    const { attendeeEmail, eventTitle } = event.payload
    
    // Send confirmation email
    await emailService.sendConfirmation(attendeeEmail, eventTitle)
    
    // Trigger downstream notifications
    await notificationService.notifyHost(...)
    
    // Update analytics
    await analytics.trackRegistration(...)
  }
}
```

### 3. Register Handler

```typescript
// src/workers/event-handlers/registry.ts
import { registrationCreatedHandler } from "./registration-created"

class EventHandlerRegistry {
  private registerHandlers(): void {
    this.register(registrationCreatedHandler)
  }
}
```

### 4. Start Worker

```bash
# Terminal
npm run worker:outbox
```

Or in production (systemd/supervisor):

```ini
[program:evenregman-outbox]
command=npm run worker:outbox
environment=ENABLE_OUTBOX_PATTERN=true,OUTBOX_RELAY_ENABLED=true
autostart=true
autorestart=true
```

## API Endpoints

### View Metrics

```
GET /api/metrics/outbox

{
  "success": true,
  "data": {
    "published": {
      "total": 1000,
      "byEventType": {
        "REGISTRATION_CREATED": 1000
      }
    },
    "processed": {
      "total": 998,
      "byEventType": {
        "REGISTRATION_CREATED": 998
      },
      "avgLatencyMs": 145.3
    },
    "failed": {
      "total": 2,
      "byEventType": {
        "REGISTRATION_CREATED": 2
      }
    },
    "queue": {
      "pending": 0,
      "failed": 2
    },
    "timestamp": "2025-08-12T18:30:00Z"
  }
}
```

### Reset Metrics

```
DELETE /api/metrics/outbox

{
  "success": true,
  "message": "Outbox metrics reset successfully"
}
```

## Monitoring

### Health Checks

```javascript
// Queue should be empty within poll interval
GET /api/metrics/outbox
const pending = data.queue.pending
if (pending > 10) alert("Outbox queue backing up")

// Processing latency should be low
const avgLatency = data.processed.avgLatencyMs
if (avgLatency > 1000) alert("Event processing slow")

// Failed events should be rare
const failed = data.failed.total
if (failed > 10) alert("Events failing, check handler logs")
```

### Logging

```
[Outbox Worker] Starting outbox relay worker
[Outbox Worker] Config: pollIntervalMs=5000, maxRetries=5
[Outbox Worker] Processing event {id}: REGISTRATION_CREATED
[Outbox Worker] Event {id} completed in 234ms
[Outbox Worker] Event {id} failed, scheduling retry in 2000ms (attempt 1/5)
[Outbox Worker] Event {id} max retries exceeded, marking as FAILED
[Outbox Worker] Stopping outbox relay worker
```

## Failure Scenarios

### Handler Fails

```
1. Handler throws error
2. Worker catches exception
3. Event status = PENDING
4. scheduledAt = now + backoff(retryCount+1)
5. retryCount++
6. Retry on next poll
```

### Worker Crashes

```
1. Worker process exits
2. Events stuck in PROCESSING state
3. Restart worker (PROCESSING → check if handler still running)
4. Or timeout events after 5 minutes:
   PROCESSING → PENDING if updated < 5 min ago
```

### Handler is Idempotent

```
// Handler MUST handle being called multiple times
// Example: Email handler
if (await emailService.alreadySent(registrationId)) {
  return // No-op, already processed
}
await emailService.send(...)
```

## Performance Characteristics

### Throughput

- **Event publishing**: < 1ms (single insert within transaction)
- **Event polling**: 100+ events/second per worker
- **Event processing**: Depends on handler (typically 100-500ms)
- **Overall throughput**: 100-500 registrations/second (with 1-2 workers)

### Latency

- **Event emission to completion**: Typically 1-5 seconds
- **Handler latency**: Depends on side effect (email: 1-5s, API call: 100-500ms)

### Scalability

- **Multi-worker**: Use distributed lock or event sharding
- **High volume**: Increase `OUTBOX_MAX_RETRIES` if handlers flaky
- **Slow handlers**: Consider increasing `OUTBOX_POLL_INTERVAL_MS`

## At-Least-Once Guarantees

The outbox pattern guarantees **At-Least-Once** delivery:

1. **Exactly once failure**: Event fails after completion → resent
2. **Handler idempotence required**: Must be safe to call multiple times
3. **No deduplication**: Downstream must handle duplicates

Example: Sending confirmation email twice is OK (idempotent).

## Backward Compatibility

✅ Fully backward compatible:
- Feature flag defaults to `false` (disabled)
- Existing registrations unaffected
- Can enable/disable at runtime
- No database migrations required

## Security Considerations

✅ Payload is stored in database:
- Encrypt sensitive data before storing in payload
- Don't include passwords or API keys in event payload
- Consider field-level encryption for PII

✅ Handler execution:
- Handlers run in same process as worker
- No additional authentication needed (trusted context)
- Log handler exceptions securely

## References

- [Testing Guide](./OUTBOX_PATTERN_TESTING.md)
- [Outbox Publisher](../src/lib/outbox.ts)
- [Event Handler Registry](../src/workers/event-handlers/registry.ts)
- [Outbox Relay Worker](../src/workers/outbox-relay.ts)
- [Metrics Endpoint](../src/app/api/metrics/outbox/route.ts)

## Further Reading

- [Pattern: Transactional Outbox](https://microservices.io/patterns/data/transactional-outbox.html)
- [Event Sourcing](https://martinfowler.com/eaaDev/EventSourcing.html)
- [Guaranteed Messaging](https://www.rabbitmq.com/confirms.html)
