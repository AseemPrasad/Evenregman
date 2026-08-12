# Atomic Reservation Engine - Deployment Strategy

## Overview

This document outlines a safe, phased deployment strategy for the atomic capacity reservation system that minimizes risk and allows for instant rollback.

## Key Principles

1. **Feature Flag Gated**: All new functionality is behind `ENABLE_ATOMIC_REGISTRATIONS` env var
2. **Default Safe**: Defaults to `false` (legacy path active)
3. **Instant Rollback**: Change one env var to revert to legacy path
4. **Observable**: Metrics separate old vs new path performance
5. **Gradual**: Phased rollout by traffic percentage

## Deployment Timeline

### Phase 0: Pre-Deployment (Week -1)

**Action**: Deploy code with feature flag disabled

```bash
# Deploy with atomic system in place but disabled
ENABLE_ATOMIC_REGISTRATIONS=false
REDIS_URL=  # Leave empty; Redis optional

# All registrations use legacy path
# No Redis dependency required
```

**Verification**:
- Build succeeds
- No TypeScript errors
- All existing tests pass
- App starts without Redis configured
- Logs show no Redis connection attempts (since REDIS_URL empty)

**Monitoring**:
- Normal registration metrics
- No new errors in logs

### Phase 1: Dry Run (Week 1)

**Action**: Enable Redis but keep atomic disabled

```bash
ENABLE_ATOMIC_REGISTRATIONS=false
REDIS_URL=redis://redis-staging:6379  # Connect to Redis
```

**Duration**: 24-48 hours

**What happens**:
- Redis client connects and is idle
- All registrations still use legacy path
- Can verify Redis connection is stable
- Metrics collector warms up

**Verification**:
- Redis connection logs show "Successfully connected"
- No timeout errors
- Registration latency unchanged
- All tests pass

**Rollback**: Not needed; Redis is passive

### Phase 2: Canary Test (Week 1-2)

**Action**: Enable atomic for 1% of traffic

```bash
ENABLE_ATOMIC_REGISTRATIONS=true  # Enable
REDIS_URL=redis://redis-staging:6379

# OR use feature flag service:
# 1% sampling on registerForEventAction
```

**Duration**: 24 hours

**What happens**:
- 1% of registrations use atomic path
- 99% use legacy path
- Both paths log metrics separately
- Can compare latency and error rates

**Monitoring**:
- Endpoint: `GET /api/metrics/registrations`
- Check JSON response:
  ```json
  {
    "registrations": {
      "atomic": {
        "attempts": 10,
        "succeeded": 9,
        "failed": 1,
        "successRate": 90
      },
      "legacy": {
        "attempts": 900,
        "succeeded": 898,
        "failed": 2,
        "successRate": 99.78
      }
    },
    "redis": {
      "checkDecrement": {
        "avgLatencyMs": 2.3,
        "successRate": 100
      }
    }
  }
  ```

**Expected Metrics**:
- Success rate: >= 99%
- Redis latency: < 5ms (p99)
- No compensation failures
- No undersells (registrations < capacity)

**If Issues**:
- Set `ENABLE_ATOMIC_REGISTRATIONS=false`
- Investigate logs for error reason
- Do NOT proceed to next phase

**Validation Checks**:
```bash
# Check for oversells (should be 0)
db.events.find({ 
  attendeeCount: { $gt: "$capacity" } 
}).count()

# Check for orphaned registrations
db.events.find({
  _id: ObjectId("..."),
  attendeeCount: { 
    $ne: { $size: registrations } 
  }
}).count()

# Verify Redis fallback happened if expected
grep "DB-only fallback" logs/*
```

### Phase 3: Staging Load Test (Week 2)

**Action**: Run full load test on staging with atomic enabled

```bash
ENABLE_ATOMIC_REGISTRATIONS=true
```

**Test Scenario**:
```bash
# Create 5 events with capacity 100 each
# Simulate 1000 concurrent registrations for 1 event (100 capacity)
# Expect exactly 100 succeed, 900 fail

# Verify:
# - Event attendeeCount == 100
# - Event status == "FULL"
# - 100 registrations created
# - 0 orphaned registrations
# - Redis metrics show 100 successful decrements
```

**Expected Results**:
- Zero oversells
- No orphaned registrations
- Atomic path ~5-10% faster (Redis early rejection)
- Zero compensation failures

**If Failures**:
- Rollback: Set `ENABLE_ATOMIC_REGISTRATIONS=false`
- Investigate in detail
- Fix issue and re-test in canary before proceeding

### Phase 4: Production Rollout (Week 3)

#### Stage 4a: 10% Traffic (Day 1)

```bash
# Option 1: Via env var with rolling deploy
ENABLE_ATOMIC_REGISTRATIONS=true

# Option 2: Via feature flag service
feature_flag('atomic_registration', { percentage: 10 })
```

**Duration**: 24 hours

**Monitoring**:
- Check `/api/metrics/registrations` every 4 hours
- Alert on:
  - Success rate drop below 95%
  - Redis latency > 100ms
  - Compensation failures > 0
  - Database consistency violations

**Rollback Trigger**:
- Any success rate drop > 5%
- Any compensation failure
- Any oversells detected
- Database inconsistency

**Rollback Action**:
```bash
# Revert in < 1 minute
ENABLE_ATOMIC_REGISTRATIONS=false

# Verify registrations work
curl -X POST /api/registrations/test \
  -d '{"email":"test@example.com"}'
```

#### Stage 4b: 50% Traffic (Day 2)

After 24 hours of stable metrics at 10%:

```bash
ENABLE_ATOMIC_REGISTRATIONS=true  # or feature_flag percentage: 50
```

**Repeat monitoring from Stage 4a**

#### Stage 4c: 100% Traffic (Day 3)

After 48 hours of stable metrics:

```bash
ENABLE_ATOMIC_REGISTRATIONS=true  # or remove feature flag logic
```

## Post-Deployment (Week 4+)

### Ongoing Monitoring

1. **Metrics Dashboard**: Create dashboard showing:
   - Atomic vs Legacy success rates
   - Redis operation latencies (p50, p95, p99)
   - Fallback events
   - Compensation events

2. **Alerting**:
   ```
   Alert if atomic_success_rate < legacy_success_rate
   Alert if redis_latency_p99 > 100ms
   Alert if compensation_failures > 0
   Alert if oversells > 0
   ```

3. **Weekly Review**:
   - Compare atomic vs legacy metrics
   - Check for patterns in failures
   - Monitor Redis memory usage
   - Verify capacity constraints

### Production Validation Queries

Run these weekly in production:

```javascript
// Check for oversells
db.events.aggregate([
  {
    $match: {
      attendeeCount: { $gt: "$capacity" }
    }
  },
  {
    $count: "oversells"
  }
])

// Check event-registration consistency
db.events.aggregate([
  {
    $lookup: {
      from: "registrations",
      let: { eventId: "$_id" },
      pipeline: [
        { $match: { $expr: { $eq: ["$eventId", "$$eventId"] }, status: "ACTIVE" } },
        { $count: "count" }
      ],
      as: "registrationCounts"
    }
  },
  {
    $match: {
      $expr: {
        $ne: [
          "$attendeeCount",
          { $arrayElemAt: ["$registrationCounts.count", 0] }
        ]
      }
    }
  }
])

// Check for orphaned registrations
db.registrations.aggregate([
  {
    $match: { status: "ACTIVE" }
  },
  {
    $group: {
      _id: "$eventId",
      count: { $sum: 1 }
    }
  },
  {
    $lookup: {
      from: "events",
      localField: "_id",
      foreignField: "_id",
      as: "event"
    }
  },
  {
    $match: {
      $expr: {
        $ne: [
          "$count",
          { $arrayElemAt: ["$event.attendeeCount", 0] }
        ]
      }
    }
  }
])
```

## Rollback Procedure

If any issue detected at any phase:

### Immediate Rollback (< 1 minute)

```bash
# 1. Disable atomic registrations
ENABLE_ATOMIC_REGISTRATIONS=false

# 2. Wait for connections to drain (< 30 seconds)

# 3. Verify legacy path works
curl -X POST /events/test-event/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test",
    "email": "test@rollback.com",
    "password": "TestPassword123!"
  }'

# Expected: 200 OK with success message
```

### Post-Rollback Investigation

```bash
# 1. Collect logs from atomic phase
grep "error\|ERROR" logs/* > atomic-errors.log

# 2. Export metrics
curl /api/metrics/registrations > atomic-metrics.json

# 3. Check database consistency
# Run production validation queries above

# 4. Create incident report
# Document what happened and why
```

### Retry After Fix

1. Identify root cause from logs
2. Apply fix
3. Re-deploy code
4. Restart from Phase 0 or Phase 2 (depending on severity)

## Success Criteria

The atomic system is ready for permanent deployment when:

1. ✅ Zero oversells during entire deployment
2. ✅ Zero compensation failures
3. ✅ Zero database inconsistencies
4. ✅ Atomic success rate >= legacy success rate
5. ✅ Redis latency p99 < 50ms
6. ✅ No increase in user-facing errors
7. ✅ >= 500,000 successful atomic registrations
8. ✅ >= 48 hours at 100% traffic with zero issues

## Permanent Deployment (Week 5+)

Once success criteria met:

1. Remove feature flag check from `registerForEventAction`
2. Rename `registerAttendeeForEventAtomic` to `registerAttendeeForEvent`
3. Delete old `registerAttendeeForEvent` function
4. Remove feature flag from env config
5. Update documentation
6. Archive metrics from legacy path

## Emergency Contacts

For deployment issues:

- On-Call Engineer: [contact info]
- Database Admin: [contact info]
- Infrastructure Team: [contact info]

## References

- [Atomic Registrations Architecture](./ATOMIC_REGISTRATIONS.md)
- [Testing Guide](./ATOMIC_REGISTRATIONS_TESTING.md)
- [Metrics & Monitoring](../src/lib/registration-metrics.ts)
- [Redis Operations](../src/lib/redis-operations.ts)
