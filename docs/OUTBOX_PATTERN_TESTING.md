# Transactional Outbox Pattern - Testing Guide

This document describes how to test the outbox pattern implementation.

## Test Structure

### Unit Tests
- Located: `src/workers/__tests__/outbox-relay.test.ts`
- Focus: Worker lifecycle, event processing, retry logic, error handling
- Can run with mocked database

### Integration Tests
- Focus: Actual event publishing and processing with MongoDB
- Requires: Live MongoDB instance
- Tests atomicity guarantees and race condition prevention

## Running Tests

### Test Dependencies

```bash
npm install --save-dev vitest @vitest/ui
```

### Setup Test Environment

```bash
# Terminal 1: Start MongoDB (local or ensure Atlas connection)
mongod --port 27017

# Terminal 2: Run tests
npm run test:outbox
```

### Environment for Tests

Create `src/workers/__tests__/.env.test`:

```env
ENABLE_OUTBOX_PATTERN=true
OUTBOX_RELAY_ENABLED=true
MONGODB_URI=mongodb://localhost:27017/evenregman-test
MONGODB_DB=evenregman-test
OUTBOX_POLL_INTERVAL_MS=1000
OUTBOX_MAX_RETRIES=5
OUTBOX_MAX_RETRY_DELAY_MS=300000
```

## Test Scenarios

### 1. Event Publishing Within Transaction

**What**: Verify events created atomically with business operations

**Test**:
```javascript
// Create event and outbox event in same transaction
const session = await startSession()
await session.withTransaction(async () => {
  // Business operation (registration)
  const registration = await Registration.create([...], { session })
  
  // Outbox event
  const outboxEvent = await OutboxEvent.create([{
    aggregateType: "REGISTRATION",
    aggregateId: registration._id.toString(),
    eventType: "REGISTRATION_CREATED",
    payload: {...},
    status: "PENDING"
  }], { session })
})

// Verify both created or both rolled back
```

### 2. Worker Event Processing

**What**: Verify worker polls and processes events

**Test**:
```javascript
// Create pending event
const event = await OutboxEvent.create({
  status: "PENDING",
  scheduledAt: new Date(),
  eventType: "REGISTRATION_CREATED",
  payload: {...}
})

// Start worker
await outboxRelay.start()

// Wait for processing
await sleep(2000)

// Verify event processed
const processed = await OutboxEvent.findById(event._id)
expect(processed.status).toBe("COMPLETED")
expect(processed.processedAt).toBeDefined()
```

### 3. Retry with Exponential Backoff

**What**: Verify failed events retry with increasing delays

**Test**:
```javascript
// Mock handler to fail
mockHandler.throwError = true

// Create event
const event = await OutboxEvent.create({
  status: "PENDING",
  eventType: "REGISTRATION_CREATED"
})

// Process (fails)
await outboxRelay.processPendingEvents()

// Check retry scheduled
let retried = await OutboxEvent.findById(event._id)
expect(retried.status).toBe("PENDING")
expect(retried.retryCount).toBe(1)
expect(retried.scheduledAt).toBeAfter(Date.now()) // Delayed

// Check backoff: 2^1 * 1000 = 2 seconds
const delay = retried.scheduledAt - Date.now()
expect(delay).toBeCloseTo(2000, 500)
```

### 4. Max Retries Exceeded

**What**: Verify event marked FAILED after 5 attempts

**Test**:
```javascript
// Create event that will fail 5 times
const event = await OutboxEvent.create({
  status: "PENDING",
  retryCount: 4, // Already tried 4 times
  eventType: "REGISTRATION_CREATED"
})

// Mock handler to fail
mockHandler.throwError = true

// Final attempt
await outboxRelay.processEvent(event)

// Verify marked FAILED
const failed = await OutboxEvent.findById(event._id)
expect(failed.status).toBe("FAILED")
expect(failed.retryCount).toBe(5)
expect(failed.processedAt).toBeDefined()
expect(failed.error).toContain("Handler error message")
```

### 5. Race Condition Prevention

**What**: Verify multiple workers don't process same event

**Test**:
```javascript
// Create 100 events
const events = await OutboxEvent.create(
  Array.from({ length: 100 }, () => ({
    status: "PENDING",
    eventType: "REGISTRATION_CREATED"
  }))
)

// Start 5 worker processes
const workers = [...]
await Promise.all(workers.map(w => w.start()))

// Wait for processing
await sleep(5000)

// Verify each event processed exactly once
const processed = await OutboxEvent.find({ status: "COMPLETED" })
expect(processed.length).toBe(100)

// Verify no events stuck in PROCESSING
const stuck = await OutboxEvent.find({ status: "PROCESSING" })
expect(stuck.length).toBe(0)
```

### 6. Atomicity: No Orphaned Events

**What**: Verify registration + outbox event always go together

**Test**:
```javascript
// Count registrations
const regCount = await Registration.countDocuments()

// Count ACTIVE registration events
const eventCount = await OutboxEvent.countDocuments({
  status: { $in: ["PENDING", "PROCESSING", "COMPLETED"] },
  eventType: "REGISTRATION_CREATED",
  aggregateType: "REGISTRATION"
})

// Should match
expect(eventCount).toBeGreaterThanOrEqual(regCount)

// Count completed events
const completedCount = await OutboxEvent.countDocuments({
  status: "COMPLETED",
  eventType: "REGISTRATION_CREATED"
})

// Verify no unprocessed registrations without events
const unmatchedRegs = await Registration.find({
  $expr: {
    $not: {
      $in: [
        "$_id",
        await OutboxEvent.distinct("aggregateId", {
          aggregateType: "REGISTRATION",
          eventType: "REGISTRATION_CREATED"
        })
      ]
    }
  }
})
expect(unmatchedRegs.length).toBe(0)
```

### 7. Handler Idempotence

**What**: Verify handlers can be safely replayed

**Test**:
```javascript
// Create mock side effect
let sideEffectCount = 0
mockHandler.onHandle = () => {
  sideEffectCount++
}

// Create event
const event = await OutboxEvent.create({
  status: "PENDING",
  eventType: "REGISTRATION_CREATED"
})

// Process twice (simulating replay)
await outboxRelay.processEvent(event)
await outboxRelay.processEvent(event)

// Side effect should happen twice (handlers must be idempotent)
// i.e., second invocation doesn't double-process
```

### 8. Feature Flag Disabling

**What**: Verify outbox is truly disabled when flag is off

**Test**:
```javascript
// Disable outbox
process.env.ENABLE_OUTBOX_PATTERN = "false"

// Create registration
await registerAttendeeForEvent(eventSlug, formData)

// Verify NO OutboxEvent created
const events = await OutboxEvent.countDocuments()
expect(events).toBe(0)

// But registration should succeed
const reg = await Registration.findOne({ attendeeEmail: formData.email })
expect(reg).toBeDefined()
```

## Performance Testing

### Throughput Benchmark

```bash
# Create 1000 registrations, measure event processing time
Time: Event publishing (within transaction) < 10ms
Time: Worker processing all 1000 events < 10 seconds
Target: 100 events/second throughput
```

### Latency Benchmark

```bash
# Create event, measure time to completion
p50: < 100ms
p95: < 500ms
p99: < 1000ms
```

### Memory Profiling

```bash
# Start worker, let it run for 10 minutes
Verify no memory leaks (stable RSS)
Verify event_latencies sliding window doesn't grow unbounded
```

## Continuous Integration

Add to `.github/workflows/test.yml`:

```yaml
- name: Run Outbox Tests
  run: npm run test:outbox
  env:
    MONGODB_URI: mongodb://localhost:27017/evenregman-test
    ENABLE_OUTBOX_PATTERN: "true"
```

## Troubleshooting

### "No handler registered for event type"

- Verify handler registered in EventHandlerRegistry
- Check eventType matches exactly
- Ensure handler imported in registry.ts

### "Event stuck in PROCESSING"

- Worker may have crashed
- Check worker logs for exceptions
- Restart worker to resume processing
- Consider adding timeout to reset PROCESSING → PENDING after 5 minutes

### "Duplicate event processing"

- Multiple workers started with same configuration
- Check that only one worker process is running in production
- Or implement Redis-based lock for distributed workers

### "Events not processing"

- Check ENABLE_OUTBOX_PATTERN=true
- Check OUTBOX_RELAY_ENABLED=true
- Check worker process is running
- Check MongoDB connection
- Verify events have scheduledAt ≤ now

## References

- [Outbox Pattern Architecture](./OUTBOX_PATTERN.md) (if created)
- [Worker Bootstrap](../src/workers/bootstrap.ts)
- [Outbox Relay](../src/workers/outbox-relay.ts)
- [Event Handler Registry](../src/workers/event-handlers/registry.ts)
