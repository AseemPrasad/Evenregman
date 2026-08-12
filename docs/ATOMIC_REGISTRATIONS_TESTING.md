# Atomic Registration Engine - Testing Guide

This document describes how to test the atomic capacity reservation system.

## Test Structure

### Unit Tests
- Located: `src/lib/__tests__/registrations-atomic.test.ts`
- Focus: Individual function behavior, error handling, edge cases
- Can run without Redis/MongoDB

### Integration Tests
- Focus: Redis + MongoDB interaction, transaction behavior
- Requires: Live Redis and MongoDB instances
- Tests concurrency, compensation, and consistency guarantees

## Running Tests

### Test Dependencies

Before running tests, ensure you have the test framework installed:

```bash
npm install --save-dev vitest @vitest/ui
```

### Setup Test Environment

```bash
# Terminal 1: Start Redis
docker run -p 6379:6379 redis:latest

# Terminal 2: Start MongoDB (local or ensure Atlas connection)
# Option A: Local MongoDB
mongod --port 27017

# Option B: Or ensure MONGODB_URI points to valid instance

# Terminal 3: Run tests
npm run test:registrations-atomic
```

### Environment for Tests

Create `src/lib/__tests__/.env.test`:

```env
ENABLE_ATOMIC_REGISTRATIONS=true
REDIS_URL=redis://localhost:6379
MONGODB_URI=mongodb://localhost:27017/evenregman-test
MONGODB_DB=evenregman-test
AUTH_SECRET=test-secret
AUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Concurrency Test: The "Flash Sale" Scenario

This test verifies that the atomic engine prevents overselling under high concurrency.

### Test Setup

1. **Create a test event:**
   ```javascript
   const event = await EventModel.create({
     hostId: testHostId,
     title: "Flash Sale Event",
     slug: "flash-sale-event",
     description: "Limited capacity event",
     date: new Date(Date.now() + 1000 * 60 * 60 * 24), // Tomorrow
     time: "14:00",
     location: "Virtual",
     capacity: 10,
     attendeeCount: 0,
     registrationCutoff: new Date(Date.now() + 1000 * 60 * 60), // 1 hour from now
     status: "OPEN"
   });
   ```

2. **Fire 100 concurrent registration requests:**
   ```javascript
   const promises = Array.from({ length: 100 }, (_, i) =>
     registerAttendeeForEventAtomic("flash-sale-event", {
       name: `Attendee ${i}`,
       email: `attendee${i}@test.com`,
       password: "TestPassword123!"
     })
   );

   const results = await Promise.all(promises);
   ```

3. **Verify Results:**
   ```javascript
   const succeeded = results.filter(r => r.success).length;
   const failed = results.filter(r => !r.success).length;

   expect(succeeded).toBe(10);
   expect(failed).toBe(90);

   // Verify event state
   const updatedEvent = await EventModel.findOne({ slug: "flash-sale-event" });
   expect(updatedEvent.attendeeCount).toBe(10);
   expect(updatedEvent.status).toBe("FULL");

   // Verify no orphaned registrations
   const registrations = await RegistrationModel.find({ eventId: event._id });
   expect(registrations.length).toBe(10);
   ```

## Redis Compensation Test

Verifies that when MongoDB fails, Redis slots are properly released.

### Test Setup

1. **Create test event with capacity 5**
2. **Mock MongoDB findOneAndUpdate to fail on 3rd call**
3. **Fire 5 concurrent registration requests**
4. **Verify:**
   - Only successful registrations are committed
   - Redis slots for failed requests are incremented back
   - Event.attendeeCount matches actual registrations
   - No orphaned registrations exist

## Fallback Mode Test

Verifies that when Redis is unavailable, the system gracefully uses DB-only mode.

### Test Setup

1. **Stop Redis or set REDIS_URL to invalid connection**
2. **Register for event multiple times**
3. **Verify:**
   - Registrations succeed (using DB-only transaction)
   - No Redis errors thrown to user
   - Warnings logged about Redis degradation
   - Capacity constraints still enforced

## Performance Benchmarking

### Atomic Path vs Legacy Path

Compare latencies:

```javascript
const atomicResults = await Promise.all(
  Array.from({ length: 100 }, () =>
    measure(registerAttendeeForEventAtomic(...))
  )
);

const legacyResults = await Promise.all(
  Array.from({ length: 100 }, () =>
    measure(registerAttendeeForEvent(...))
  )
);

console.log("Atomic avg:", average(atomicResults));
console.log("Legacy avg:", average(legacyResults));
```

Expected: Atomic path ~5-10% faster due to early Redis rejection of oversold requests.

## Monitoring During Tests

### Logs to Check

1. **Redis Operations:**
   ```
   [Redis] Successfully connected
   [Redis] checkAndDecrement failed: ... Proceeding with DB-only fallback.
   ```

2. **Compensation:**
   ```
   [Redis Compensation] Successfully rolled back event {eventId}. Capacity restored.
   [Redis Compensation] Rollback failed for event {eventId}: ... ALERT: Manual intervention may be required.
   ```

3. **Transactions:**
   ```
   Transaction committed successfully
   Transaction aborted, initiating rollback
   ```

## Continuous Integration

Add to `.github/workflows/test.yml` or equivalent CI config:

```yaml
- name: Start Redis
  run: docker run -d -p 6379:6379 redis:latest

- name: Run Atomic Registration Tests
  run: npm run test:registrations-atomic
  env:
    REDIS_URL: redis://localhost:6379
    MONGODB_URI: mongodb://localhost:27017/evenregman-test
```

## Troubleshooting

### "Redis timeout" errors in tests

- Increase timeout in test: `redisCheckAndDecrement(eventId, capacity, 2000)`
- Check Redis is running: `redis-cli ping` should return "PONG"
- Check network connectivity

### "MongoDB connection failed"

- Ensure MONGODB_URI is valid
- Check MongoDB is running
- Verify database exists

### Concurrency test shows fewer than 10 successes

- This indicates a concurrency issue (bug) - should never happen
- Check Redis is working properly
- Verify MongoDB transaction support is enabled
- Review event state after test for inconsistencies

### Redis compensation never triggered in tests

- Verify MongoDB mock is properly configured to fail
- Check transaction abort is actually happening
- Verify event state shows Redis wasn't cleaned up

## Next Steps

After tests pass:

1. Run load test (1000 concurrent requests)
2. Monitor for memory leaks (connection pooling)
3. Verify Redis keys are properly cleaned up
4. Check database indexes are efficient
5. Profile latency percentiles (p50, p95, p99)
