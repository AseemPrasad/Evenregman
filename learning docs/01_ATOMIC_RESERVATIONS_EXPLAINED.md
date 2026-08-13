# Atomic Reservations - Complete Learning Guide

## What Problem Are We Solving?

Imagine 1,000 people trying to register for the last 5 seats in an event simultaneously. What happens?

### Without Atomicity (Wrong Way)

```
Thread 1: Check capacity (5 seats left)    → YES, proceed
Thread 2: Check capacity (5 seats left)    → YES, proceed
Thread 3: Check capacity (5 seats left)    → YES, proceed
Thread 4: Check capacity (5 seats left)    → YES, proceed
Thread 5: Check capacity (5 seats left)    → YES, proceed
Thread 6: Check capacity (5 seats left)    → YES, proceed (OVERBOOKING!)
...
All 6 people booked, but only 5 seats!
```

**This is a race condition.**

### With Atomicity (Right Way)

```
Thread 1: LOCK event, check capacity, register, UNLOCK
Thread 2: WAIT for lock, check capacity (4 left), register, UNLOCK
Thread 3: WAIT for lock, check capacity (3 left), register, UNLOCK
Thread 4: WAIT for lock, check capacity (2 left), register, UNLOCK
Thread 5: WAIT for lock, check capacity (1 left), register, UNLOCK
Thread 6: WAIT for lock, check capacity (0 left), WAITLIST, UNLOCK
```

**No overbooking. Correct behavior.**

---

## How Evenregman Solves This

### The Implementation

**File**: `src/lib/atomic-reservation.ts`

```typescript
async function atomicReservation(
  eventId: string,
  seatsRequested: number,
  userId: string
) {
  // Start a MongoDB session (for transactions)
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Read with lock (prevents other threads from modifying)
    const event = await Event.findById(eventId, null, {session});

    // Check capacity
    if (event.registeredCount + seatsRequested <= event.totalCapacity) {
      // Create registration
      const registration = new Registration({
        eventId,
        userId,
        seatsRequested,
        status: 'confirmed'
      });
      await registration.save({session});

      // Update event counter
      event.registeredCount += seatsRequested;
      await event.save({session});

      // Commit transaction (makes all changes permanent)
      await session.commitTransaction();
      return {status: 'confirmed'};
    } else {
      // Not enough seats - waitlist
      const registration = new Registration({
        eventId,
        userId,
        seatsRequested,
        status: 'waitlisted'
      });
      await registration.save({session});
      event.waitlistedCount += seatsRequested;
      await event.save({session});

      await session.commitTransaction();
      return {status: 'waitlisted'};
    }
  } catch (error) {
    // Something went wrong - undo everything
    await session.abortTransaction();
    throw error;
  } finally {
    // Always close the session
    session.endSession();
  }
}
```

### Why This Works

1. **Transaction begins**: All operations are grouped together
2. **Lock acquired**: No other thread can modify this event while we're in the transaction
3. **Read capacity**: We see the current state
4. **Conditional write**: Only if condition is met, we write
5. **Atomic commit**: Either all changes persist, or none do

**Key insight**: The database ensures that only ONE thread can modify the event at a time during the transaction. Others must wait their turn.

---

## MongoDB Sessions Explained

### What is a Session?

A session is a context for a transaction. It tells MongoDB: "These operations are part of one logical unit."

### Session Lifecycle

```
┌─────────────────────────────────────────┐
│ startSession()                          │
│ ↓                                       │
│ startTransaction()                      │
│ ↓                                       │
│ Read event.registeredCount              │
│ Read event.totalCapacity                │
│ Create registration                     │
│ Update event.registeredCount            │
│ ↓                                       │
│ commitTransaction() or abortTransaction │
│ ↓                                       │
│ endSession()                            │
└─────────────────────────────────────────┘
```

### Critical Properties (ACID)

| Property | Meaning | Example |
|----------|---------|---------|
| **A**tomicity | All or nothing | Either register succeeds completely, or not at all |
| **C**onsistency | Valid state to valid state | Capacity counter always accurate |
| **I**solation | Transactions don't interfere | Thread 1's read happens before Thread 2's write |
| **D**urability | Persisted data doesn't disappear | After commit, we can never lose the data |

---

## Real-World Scenario

### Scenario: Black Friday Event

Event has 100 seats. 500 people try to register in the first second.

**What happens**:

```
Requests arrive (microseconds apart):
1, 2, 3, 4, 5, ... 100 → All successful (seats 1-100)
101 → Waits for transaction 100 to commit
102 → Waits for transaction 100 to commit
... (all 101-500 wait or execute in sequence)

After transaction 100 commits:
101, 102, 103, ... → All see registeredCount = 100
102 → Tries to register, sees 100 + 1 > 100, gets waitlisted
103, 104, ... → All waitlisted

Result: 100 confirmed, 400 waitlisted. Perfect!
```

---

## Without Transactions (What Goes Wrong)

**Scenario**: Without atomicity

```
Thread A: Check → 5 seats left
Thread B: Check → 5 seats left
Thread C: Check → 5 seats left
Thread A: Insert registration for 3 seats
Thread B: Insert registration for 2 seats
Thread C: Insert registration for 2 seats
Database now has 7 registrations, but only 5 capacity!
```

**Consequences**:
- Overbooking
- Angry customers (confirmed then no seat)
- Business loss
- Reputation damage

---

## Implementation Details

### The Data Model

**Event model**:
```typescript
interface Event {
  _id: ObjectId;
  name: string;
  totalCapacity: number;
  registeredCount: number;    // Denormalized counter
  waitlistedCount: number;    // Denormalized counter
  startDate: Date;
  endDate: Date;
}
```

**Why denormalize?** 
- Alternative: Count registrations dynamically → slow query
- Denormalized: Direct field read → fast

**Tradeoff**: Must update counter on every registration (tiny cost) vs query-time aggregation (huge cost)

### The Registration Model

```typescript
interface Registration {
  _id: ObjectId;
  eventId: ObjectId;
  userId: ObjectId;
  seatsRequested: number;
  status: 'confirmed' | 'waitlisted' | 'cancelled';
  confirmedAt: Date;
  cancelledAt?: Date;
}
```

### How It's Used in the API

**File**: `src/app/api/registrations/route.ts`

```typescript
export async function POST(req: Request) {
  const {eventId, seatsRequested} = await req.json();
  const userId = getCurrentUser(); // From auth middleware

  // Validate input
  if (seatsRequested < 1 || seatsRequested > 10) {
    return Response.json({error: "Invalid seats"}, {status: 400});
  }

  try {
    // Call the atomic reservation function
    const result = await atomicReservation(eventId, seatsRequested, userId);

    // Return result
    return Response.json(result);
  } catch (error) {
    return Response.json({error: "Failed to register"}, {status: 500});
  }
}
```

---

## Testing Atomicity

### Unit Test Example

```typescript
describe('Atomic Reservations', () => {
  it('should not allow overbooking', async () => {
    // Create event with 5 seats
    const event = await Event.create({
      name: 'Test Event',
      totalCapacity: 5,
      registeredCount: 0
    });

    // Try to register 3 seats concurrently
    const results = await Promise.all([
      atomicReservation(event._id, 3, 'user1'),
      atomicReservation(event._id, 2, 'user2'),
      atomicReservation(event._id, 2, 'user3'),
      atomicReservation(event._id, 1, 'user4'),
    ]);

    // Verify results
    expect(results[0].status).toBe('confirmed');  // 3 seats (3 left)
    expect(results[1].status).toBe('confirmed');  // 2 seats (1 left)
    expect(results[2].status).toBe('waitlisted'); // 2 seats but only 1 left
    expect(results[3].status).toBe('waitlisted'); // 1 seat but none left

    // Verify database state
    const updatedEvent = await Event.findById(event._id);
    expect(updatedEvent.registeredCount).toBe(5); // Exactly 5
    expect(updatedEvent.waitlistedCount).toBe(3); // Exactly 3
  });
});
```

---

## Performance Implications

### Latency

With transactions, each registration takes:
- Session start: ~1ms
- DB round trip + lock: ~5ms
- Transaction commit: ~2ms
- **Total**: ~8ms per request

Without transactions (risky):
- DB round trip: ~5ms
- **Total**: ~5ms per request

**Tradeoff**: 3ms slower, but guaranteed correctness.

### Throughput

With 100 concurrent requests:

**Sequential execution** (due to lock):
- Total time: 100 × 8ms = 800ms
- Throughput: 125 registrations/second

**Without atomicity** (risky, faster):
- Total time: ~5ms (all parallel)
- Throughput: 20,000 registrations/second
- But incorrect (overbooking possible)

**Decision**: Correctness > Speed. 125 reg/sec is sufficient for most events.

---

## Failure Modes & Recovery

### Scenario 1: Transaction Timeout

```typescript
// After 30 seconds, transaction times out
try {
  const session = await startSession();
  // ... long operation ...
  await session.commitTransaction(); // ERROR: timeout
} catch {
  // Aborted automatically by MongoDB
  // User sees error: "Please try again"
}
```

**Recovery**: Retry is safe (idempotent check)

### Scenario 2: MongoDB Replica Crash

```
Primary goes down mid-transaction
↓
Session aborts automatically
↓
User sees error
↓
Database state unchanged (didn't commit)
↓
User can retry safely
```

**Recovery**: Automatic - transactions are rolled back

### Scenario 3: Network Partition

```
Client ↔ MongoDB network broken
↓
Session times out (5 seconds default)
↓
Aborted automatically
↓
Client retries (exponential backoff)
```

**Recovery**: Automatic

---

## Alternatives to Transactions

### 1. Optimistic Locking

```typescript
// Version-based approach
const event = await Event.findById(eventId);
const version = event.version;

// Try to update
const result = await Event.updateOne(
  {_id: eventId, version: version},  // Only update if version matches
  {$inc: {registeredCount: 3}, $inc: {version: 1}}
);

if (result.modifiedCount === 0) {
  // Someone else updated it, retry
  return retry();
}
```

**Pros**: No locking, more concurrency  
**Cons**: Retries needed, complex error handling

**When to use**: Low contention (unlikely conflicts)

### 2. Distributed Lock (Redis)

```typescript
const lockKey = `reservation:${eventId}`;
const acquired = await redis.set(lockKey, '1', 'NX', 'EX', '10');

if (!acquired) {
  return {error: 'Too many concurrent registrations'};
}

try {
  // Check and update
  const event = await Event.findById(eventId);
  // ... register ...
} finally {
  await redis.del(lockKey);
}
```

**Pros**: Works across services  
**Cons**: Requires Redis, more complexity

**When to use**: Microservices architecture

### 3. Event Sourcing

```typescript
// Instead of updating capacity counter:
// Store each registration as an immutable event

await RegistrationEvent.create({
  eventId,
  userId,
  seatsRequested,
  timestamp: Date.now()
});

// To get current capacity: Sum all events
const totalRegistered = await RegistrationEvent.aggregate([
  {$match: {eventId, status: 'confirmed'}},
  {$group: {_id: null, total: {$sum: '$seatsRequested'}}}
]);
```

**Pros**: Full audit trail, temporal queries  
**Cons**: Slower reads, more storage

**When to use**: When you need complete history

---

## Why MongoDB Sessions?

**Evenregman chose MongoDB transactions because**:

1. ✓ Simple to use (no external dependencies)
2. ✓ Strong consistency guarantees (ACID)
3. ✓ Automatic failure recovery
4. ✓ Works with existing MongoDB schema
5. ✓ Good performance for moderate contention

**Alternatives considered**:
- Redis locks (requires additional infrastructure)
- Optimistic locking (complex retry logic)
- Event sourcing (more complex queries)

**Decision**: Use MongoDB sessions, add Redis cache layer later if needed.

---

## Key Takeaways

1. **Atomicity is critical** for seat reservations
2. **MongoDB sessions** provide ACID guarantees
3. **Trade latency for correctness** (8ms for guaranteed accuracy)
4. **Denormalized counters** make capacity checks fast
5. **Always handle failure modes** (timeout, network issues)
6. **Test for race conditions** explicitly
7. **Monitor for contention** (lock wait times)

---

## Practice Questions

1. What happens if the `session.commitTransaction()` line throws an error?
2. Why do we denormalize registeredCount instead of counting at query time?
3. How would you implement a "cancel registration" operation atomically?
4. What's the difference between atomicity and consistency?
5. Why can't we use a simple `{ $inc }` operation instead of sessions?

**Answers** in the linked architecture documents.

---

## Related Topics

- CDC Architecture (how registrations feed the analytics pipeline)
- Circuit Breaker (what happens if registration service is slow)
- Caching (why we cache event details)
- Authorization (who can register for which events)

---

**Next**: Read `docs/ATOMIC_REGISTRATIONS_TESTING.md` for test strategies.
