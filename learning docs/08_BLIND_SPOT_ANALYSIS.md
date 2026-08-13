# Evenregman - Blind Spot Analysis

Analysis of conceptual gaps between what you appear to understand and what you might be missing based on your interactions with this project.

---

# CRITICAL BLIND SPOTS

These gaps could cause real production failures or poor architectural decisions.

---

## Blind Spot #1: Atomic Transactions ≠ Consistency

**What you appear to understand:**
- MongoDB transactions prevent overbooking
- Atomic = all-or-nothing
- Lock-based serialization works

**What you're actually missing:**
The difference between **atomicity** (ACID property) and **consistency** (business logic guarantee).

Atomicity = "transaction completes or rolls back"
Consistency = "business rules are maintained"

You can have atomic transactions that VIOLATE business rules.

**Why it matters:**
- You might think transactions solve all concurrency problems
- They don't
- Transaction might create registration but then fail to update capacity counter WITHIN the same transaction
- If you separate these, transaction is atomic but business is inconsistent

**Repository-specific example:**

```typescript
// This is atomic but INCONSISTENT
const registerForEvent = async (eventId, userId, seats, session) => {
  await session.startTransaction();
  
  try {
    // Create registration (success)
    const reg = await Registration.create({...}, {session});
    
    // Update capacity (FAILS mid-way)
    const event = await Event.findById(eventId, null, {session});
    event.registeredCount += seats;
    
    // If we THROW here (before save), capacity NOT updated
    throwRandomError();  // Simulates crash
    
    await event.save({session});
    
    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    // Registration rolled back, BUT...
    // What if user retries with different data?
    // What if registration was already seen?
  }
};
```

**The real problem:**
- Registration created but not finalized
- Capacity counter not updated
- Registration is "zombie" (exists but shouldn't)
- Not caught by atomicity check

**Question that exposes the gap:**

> "If I have this code:
> ```typescript
> const registration = await Registration.create({...}, {session});
> const event = await Event.findById(eventId, null, {session});
> 
> if (event.capacity < seats) {
>   throw new Error('Not enough capacity');
> }
> 
> event.registeredCount += seats;
> await event.save({session});
> await session.commitTransaction();
> ```
> 
> Is this ATOMIC? Is this CONSISTENT? What could go wrong?"

**Expected answer for understanding:**
- "It's atomic (all succeeds or rolls back)"
- "It's NOT consistent (capacity check is AFTER insert, so we could violate the constraint)"
- "The check should happen BEFORE insert"
- "Or capacity check should be in a separate transaction to prevent double-check"

**Practical exercise:**

Write a test that:
1. Inserts registration
2. Throws error before capacity update
3. Verifies capacity counter is still outdated
4. Explains why atomicity didn't help here
5. Fix the code to be both atomic AND consistent

```typescript
test('transaction atomicity does not guarantee business consistency', async () => {
  const event = await createEvent({capacity: 100, registered: 95});
  
  try {
    // This registration will be created but capacity not updated
    await registerAndCrashBeforeSave(event._id, 5);
  } catch (error) {
    // Expected crash
  }
  
  // Check inconsistency
  const reg = await Registration.findOne({eventId: event._id});
  const updatedEvent = await Event.findById(event._id);
  
  // Registration exists (was inserted before crash)
  expect(reg).toBeDefined();
  
  // But capacity wasn't updated (still 95)
  expect(updatedEvent.registeredCount).toBe(95);  // Should be 100!
  
  // This is the consistency violation
  console.log('INCONSISTENT: Registration exists but not counted toward capacity');
});
```

---

## Blind Spot #2: CDC Eventually-Consistent ≠ Real-Time

**What you appear to understand:**
- CDC projects changes to analytics DB
- Dashboard shows data from analytics
- 5-second lag acceptable

**What you're actually missing:**
The implications of "eventually consistent" in YOUR specific system.

You keep saying "analytics can be 5s stale" - but do you actually understand the consequences?

**Why it matters:**
- You might design around false assumption: "host can rely on dashboard numbers"
- Host might see "2 seats left" but registration fails anyway
- Host thinks system is broken (it's not, just eventual consistency)
- Without understanding this deeply, you'll make poor UX decisions

**Repository-specific example:**

Scenario: Host uses dashboard to make decisions

```
Dashboard shows: 98 seats registered, 2 available
Host thinks: "I'll manually approve the next registration to fill it"

Reality (at CDC polling moment):
- 99 seats already registered (not yet in analytics)
- Only 1 seat actually available
- Host approves 1 registration
- But 2 people hit register before host decision

What happens:
1. Person A registers → succeeds → 100 seats
2. Person B registers → fails (capacity exceeded)
3. Host's manual approval → queues the decision
4. Meanwhile, analytics still shows 98 (CDC hasn't caught up)

Host now has:
- Manual approval queued (thinks they're helping)
- But Person B already rejected by system
- Manual approval won't help Person B
- System appears broken to host
```

**The real gap:**
You understand CDC is slow. But do you understand:
- Host making decisions based on stale data?
- Users seeing "accepted" in one moment, "rejected" in another?
- Async approval creating confusion?
- Need for "refresh" button or real-time updates?

**Question that exposes the gap:**

> "A host sees the dashboard says 50 seats left. They click approve for a registration that was pending. But in reality, 47 people just registered in the last 5 seconds (not in analytics yet). Now the approval would overfill the event. What's the correct behavior? What should the system do? What does the user see?"

**Expected answer for understanding:**
- "Dashboard shows stale number"
- "Approval doesn't check fresh capacity (uses eventual-consistent number)"
- "Approval could overfill event"
- "System should do real-time capacity check at approval time, not use dashboard number"
- "User sees 'Approval succeeds' but event is now overboooked"
- "This is why CDC projection isn't enough for approval workflows"

**Practical exercise:**

Implement approval flow that handles eventual consistency:

```typescript
// Current (WRONG): Uses analytics number
const approveRegistration = async (registrationId) => {
  const registration = await Registration.findById(registrationId);
  const event = await Event.findById(registration.eventId);
  
  // Reads from analytics (eventual consistent)
  const capacity = await getAnalyticsCapacity(event._id);
  
  if (capacity < 0) {
    throw new Error('No capacity');  // Using STALE data!
  }
  
  registration.status = 'approved';
  await registration.save();
};

// Fixed (CORRECT): Checks real capacity with lock
const approveRegistration = async (registrationId) => {
  const session = await mongo.startSession();
  session.startTransaction();
  
  try {
    const registration = await Registration.findById(registrationId, null, {session});
    const event = await Event.findById(registration.eventId, null, {session});
    
    // Real-time capacity check (with lock)
    if (event.registeredCount + registration.seats > event.capacity) {
      throw new Error('No capacity (real-time check)');
    }
    
    registration.status = 'approved';
    event.registeredCount += registration.seats;
    
    await registration.save({session});
    await event.save({session});
    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    throw error;
  }
};
```

---

## Blind Spot #3: Error Handling ≠ Resilience

**What you appear to understand:**
- Circuit breaker pattern
- Timeouts
- Retry logic

**What you're actually missing:**
The difference between "handling an error" and "being resilient to failure".

Handling: Catching exception and logging it
Resilience: System continues working despite failure

You might catch an error (handle) but system still fails (not resilient).

**Why it matters:**
- You might think try-catch = resilience
- It doesn't
- You need circuit breaker + retry + fallback + degraded mode
- Without this, you have brittle error handling

**Repository-specific example:**

```typescript
// This HANDLES error but is NOT RESILIENT
const sendEmail = async (userId, email) => {
  try {
    await emailService.send(email);
  } catch (error) {
    console.error('Email failed:', error);  // Handled
  }
  // But email was never sent, user never knows
};

// This is RESILIENT
const sendEmail = async (userId, email) => {
  try {
    // Attempt with circuit breaker
    await circuitBreaker.execute(() => emailService.send(email));
  } catch (error) {
    if (error instanceof CircuitBreakerOpenError) {
      // Circuit open: queue email for later
      await emailQueue.enqueue({userId, email, retryAt: now + 30s});
      return {status: 'queued'};
    } else {
      // Other error: queue with backoff
      await emailQueue.enqueue({userId, email, retryAt: now + 1m});
      return {status: 'queued'};
    }
  }
  return {status: 'sent'};
};
```

**The real gap:**
Error handling is tactical (fix this one error).
Resilience is strategic (system keeps working despite failures).

You might implement error handling but miss:
- Graceful degradation (show cached data if API slow)
- Fallback paths (use email queue if service down)
- Bulkheads (isolate failure, don't spread to other users)
- Health checks (know when to activate fallbacks)

**Question that exposes the gap:**

> "Email service goes down. Registration endpoint does try-catch on email send. What happens to:
> - Guest experience?
> - Registration success?
> - Resiliency for other guests?
> - When does email eventually send?
> - What if email service is down for 48 hours?"

**Expected answer for understanding:**
- "Guest might see registration succeed but no email (bad UX)"
- "Or registration fails and guest retries (bad UX)"
- "Resilience needs queue not try-catch"
- "Email queued and retried until success"
- "Other guests unaffected (isolated failure)"
- "After 48 hours, email eventually sends when service recovers"

**Practical exercise:**

Implement resilient email flow:

```typescript
// Level 1: Error handling only (NOT resilient)
// Level 2: Error handling + retry (slightly resilient)
// Level 3: Circuit breaker + queue + backoff (resilient)
// Level 4: Circuit breaker + queue + exponential backoff + dead-letter + alerting (highly resilient)

test('resilience: email down for 1 hour, registrations succeed', async () => {
  const emailService = createMockService({down: true});
  
  // Registrations should succeed despite email down
  const registrations = [];
  for (let i = 0; i < 10; i++) {
    const result = await register(eventId, user_i, 1);
    expect(result.status).toBe('confirmed');
    registrations.push(result);
  }
  
  // Emails queued, not sent
  const queuedEmails = await getQueuedEmails();
  expect(queuedEmails.length).toBe(10);
  
  // Email service recovers
  emailService.down = false;
  
  // Background job sends queued emails
  await processEmailQueue();
  
  // All emails eventually sent
  const sentEmails = await getSentEmails();
  expect(sentEmails.length).toBe(10);
});
```

---

## Blind Spot #4: Capacity ≠ Reservations

**What you appear to understand:**
- Event has capacity (100 seats)
- Registrations consume capacity
- Can't exceed capacity

**What you're actually missing:**
Capacity is a business constraint, not a technical one.

Atomic transactions prevent the TECHNICAL problem (race condition).
But don't prevent the BUSINESS problem (overbooking due to design).

**Why it matters:**
- You might think atomic transaction solves overbooking
- It solves the race condition, not the business rule
- You can implement atomic transactions that still overbooking
- Example: Waitlisted registrations that consume capacity when confirmed

**Repository-specific example:**

```typescript
// Scenario: Event capacity 100
// Current: 95 confirmed, 10 waitlisted

// Waitlisted user gets approved and moved to confirmed
const approveWaitlistedRegistration = async (registrationId) => {
  const reg = await Registration.findById(registrationId);
  
  // Atomic update
  reg.status = 'confirmed';
  await reg.save();  // Atomic!
  
  // But now: 106 confirmed (95 + 10 waitlisted = 105, plus this one = 106)
  // OVERBOOKING!
};
```

**The real gap:**
- Atomicity at transaction level ≠ Atomicity at business level
- Confirming waitlisted might violate capacity
- You need to check capacity BEFORE confirming
- Or prevent creating waitlist if at capacity
- Or have separate capacity for waitlist

**Question that exposes the gap:**

> "Design the waitlist feature. Event has 100 capacity, 95 confirmed. What's the waitlist size?
> When someone cancels, do you:
> A) Immediately promote first waitlist person to confirmed?
> B) Notify them they can confirm within 24 hours?
> C) Other?
>
> What fails in your approach at scale?"

**Expected answer for understanding:**
- "Waitlist is separate capacity (not counted toward 100)"
- "On cancellation, promote from waitlist atomically"
- "But race condition: multiple cancellations promote multiple waitlisted"
- "At scale: might overfill event if many cancellations simultaneous"
- "Solution: Queue confirmations, process sequentially"

**Practical exercise:**

Design waitlist that prevents overbooking:

```typescript
test('waitlist promotion does not cause overbooking', async () => {
  const event = createEvent({capacity: 100});
  const confirmed = createRegistrations(95, 'confirmed');
  const waitlisted = createRegistrations(10, 'waitlisted');
  
  // Simultaneous cancellations
  const cancellations = [];
  for (let i = 0; i < 5; i++) {
    cancellations.push(
      cancelRegistration(confirmed[i]._id)
    );
  }
  
  // 5 cancellations → 5 seats available
  // But 10 waitlisted → who gets promoted?
  await Promise.all(cancellations);
  
  // Should only promote first 5
  const confirmed_after = await Registration.countDocuments({
    status: 'confirmed'
  });
  
  expect(confirmed_after).toBe(100);  // Not 105!
});
```

---

# HIGH PRIORITY BLIND SPOTS

These won't cause immediate failures but indicate gaps in architectural understanding.

---

## Blind Spot #5: Eventual Consistency Implications

**What you appear to understand:**
- CDC has lag (5 seconds)
- Analytics DB is stale
- Dashboard shows old numbers

**What you're actually missing:**
The full implications of eventual consistency for EVERY workflow.

Not just dashboard display. Affects:
- Approvals (shown in Blind Spot #2)
- Cancellations (what if CDC hasn't seen original registration yet?)
- Refunds (process before registration recorded?)
- Reporting (old data for compliance)

**Why it matters:**
Eventual consistency is contagious. If you accept it in one place, it spreads.

**Repository-specific example:**

```
Timeline:
T=0: Guest registers for event (atomic transaction)
T=1: System publishes "RegistrationCreated" event
T=2: Email queued (Outbox pattern)
T=3: Registration returned to guest (confirmed)
T=4: Request completes, guest closes browser

T=5: CDC worker polls oplog, sees registration
T=6: CDC projects to analytics (updates count)
T=7: Host refreshes dashboard, sees updated count

But what if guest CANCELS at T=4.5?

T=4.5: Guest cancels registration
T=4.6: Cancellation atomic transaction (capacity released)
T=4.7: "RegistrationCancelled" event published
T=4.8: Cancellation confirmed to guest

T=5: CDC worker polls oplog
T=5.1: CDC sees original registration (not cancellation yet, because it's slow)
T=5.2: CDC increments count (WRONG! Registration was cancelled)
T=5.3: CDC eventually sees cancellation event and decrements

Result: 200ms window where analytics shows WRONG count
Guest cancelled but analytics thinks they registered
```

**The real gap:**
You understand lag conceptually. But not:
- Ordering issues (what if CDC sees cancellation before registration?)
- Window of incorrectness (analytics wrong for period X)
- Multi-event correlations (what if related events processed out of order?)
- Compliance implications (financial records must be correct)

**Question that exposes the gap:**

> "Guest registers, immediately cancels, immediately registers again, all within 1 second.
> Analytics might see in this order:
> A) Register, Cancel, Register (correct)
> B) Register, Register, Cancel (overbooking!)
> C) Cancel, Register, Register (capacity goes negative!)
>
> Which is most likely with your CDC? How do you prevent this?"

**Expected answer for understanding:**
- "CDC processes by partition (by eventId), so order preserved"
- "But if events on different partitions, order not guaranteed"
- "If same eventId, order preserved by Kafka partition key"
- "Should never see (C)"
- "Might see (B) if CDC delays between events"

**Practical exercise:**

Test event ordering under eventual consistency:

```typescript
test('CDC preserves event order within same event', async () => {
  const eventId = 'event_123';
  
  // Three events in quick succession
  const events = [
    {type: 'RegistrationCreated', registrationId: 'reg_1'},
    {type: 'RegistrationCancelled', registrationId: 'reg_1'},
    {type: 'RegistrationCreated', registrationId: 'reg_2'}
  ];
  
  // All events have same eventId (partition key)
  for (const event of events) {
    await publishEvent({...event, eventId});
  }
  
  // Wait for CDC to process
  await sleep(6000);  // 5s lag + 1s buffer
  
  // Check analytics state
  const analytics = await Analytics.findOne({eventId});
  
  // Should see exactly 1 registration (reg_1 created and cancelled, reg_2 created)
  expect(analytics.confirmCount).toBe(1);
  
  // Order should be correct
  const events_received = await getReceivedEvents(eventId);
  expect(events_received.map(e => e.type)).toEqual([
    'RegistrationCreated',
    'RegistrationCancelled',
    'RegistrationCreated'
  ]);
});
```

---

## Blind Spot #6: Concurrency ≠ Parallelism

**What you appear to understand:**
- Lock prevents two threads from executing simultaneously
- Database transactions serialize access

**What you're actually missing:**
Concurrency (interleaving of operations) and parallelism (simultaneous execution) are different.

You can have concurrency without parallelism (single CPU, switching between threads).
You can have parallelism without concurrency problems (separate databases).

**Why it matters:**
- You might design around false assumption about locking
- Might not understand scheduler behavior
- Might miss timing-dependent bugs

**Repository-specific example:**

```typescript
// Assume: 2 threads (T1, T2) both trying to register

// Pseudo-timeline (single CPU, preemptive scheduling)
T1: START TRANSACTION
T2: START TRANSACTION (queued, waiting for lock)
T1: Read event.registeredCount = 95
T1: Check: 95 + 5 <= 100? YES
T1: Create registration
T1: (PREEMPTED by scheduler, gives way to other thread)
T2: Read event.registeredCount = 95 (same value T1 read before update!)
T2: Check: 95 + 5 <= 100? YES
T2: Create registration
T2: (Wait, T1 now resumes)
T1: Update event.registeredCount = 100
T1: COMMIT
T2: Update event.registeredCount = 100 (should be 105! overbooking!)

// This doesn't happen with proper locking
// But the POINT is: understanding preemption matters
```

**The real gap:**
You understand locks prevent this. But do you understand:
- Why locks are needed (preemption interleaving)
- Deadlock scenarios (T1 locks A then B, T2 locks B then A)
- Priority inversion (low-priority task holds lock, blocks high-priority)
- Lock timing (when does lock actually release?)

**Question that exposes the gap:**

> "Two guests try to cancel simultaneously. Both own different registrations for same event.
> Event capacity: 100, current: 100 (full)
> Guest A cancels 5 seats, Guest B cancels 3 seats
>
> What's the race condition? What's the correct final capacity?"

**Expected answer for understanding:**
- "Both read current capacity (100)"
- "A: 100 - 5 = 95"
- "B: 100 - 3 = 97"
- "Final could be 95 or 97 (whichever writes last)"
- "Correct: 100 - 5 - 3 = 92"
- "Solution: Atomic transaction on event, not just registration"

**Practical exercise:**

Implement and test concurrent cancellations:

```typescript
test('concurrent cancellations update capacity correctly', async () => {
  const event = createEvent({capacity: 100, registered: 100});
  const regA = createRegistration({seats: 5});
  const regB = createRegistration({seats: 3});
  
  // Cancel simultaneously
  await Promise.all([
    cancelRegistration(regA._id),
    cancelRegistration(regB._id)
  ]);
  
  const final = await Event.findById(event._id);
  
  // Without proper locking, might be 97 or 95
  // With proper locking, should be 92
  expect(final.registeredCount).toBe(92);
});
```

---

## Blind Spot #7: Testing ≠ Coverage

**What you appear to understand:**
- Unit tests check functions
- Integration tests check systems
- Coverage = lines tested

**What you're actually missing:**
High coverage doesn't mean good testing.

You can have 100% coverage and miss critical bugs.
Example: Testing that code runs, not that it's correct.

**Why it matters:**
- You might think "I'll write tests" and feel confident
- But tests might not catch real bugs
- Testing concurrency requires different approach
- Testing timing requires careful setup

**Repository-specific example:**

```typescript
// High coverage, but WRONG test
test('atomic reservation works', async () => {
  const event = createEvent({capacity: 100, registered: 95});
  
  const result = await atomicReservation(event._id, userId, 5);
  
  expect(result.status).toBe('confirmed');  // ✓ Passes
  
  // But what's NOT tested?
  // - Concurrent registrations
  // - Timing of lock release
  // - Cleanup on failure
  // - Idempotency
});

// Better test
test('concurrent registrations do not overbooking', async () => {
  const event = createEvent({capacity: 100, registered: 95});
  
  // Two concurrent attempts for 3 seats each
  const [result1, result2] = await Promise.all([
    atomicReservation(event._id, user1, 3),
    atomicReservation(event._id, user2, 3)
  ]);
  
  // One succeeds, one fails
  expect(
    (result1.status === 'confirmed') XOR (result2.status === 'confirmed')
  ).toBe(true);
  
  // Final capacity correct
  const final = await Event.findById(event._id);
  expect(final.registeredCount).toBe(98);  // 95 + 3, not 95 + 3 + 3
});
```

**The real gap:**
You understand testing basics. But not:
- Race condition testing (concurrent, not sequential)
- Timing-dependent bugs (need mocked clocks)
- State machine testing (all valid transitions)
- Property testing (generate random inputs)
- Chaos testing (fail components randomly)

**Question that exposes the gap:**

> "How would you write a test that proves the atomic reservation can't be double-registered?
> Write a test that would FAIL if someone removed the transaction lock."

**Expected answer for understanding:**
- "Run N concurrent registrations for same guest"
- "Only 1 should succeed"
- "Others should get 'capacity exceeded' or 'already registered'"
- "Repeat test 100x (timing is random)"
- "If lock removed, test would fail (see duplicates)"

**Practical exercise:**

Write tests that catch real bugs:

```typescript
// Test 1: Concurrency
test('race condition caught', async () => {
  for (let attempt = 0; attempt < 100; attempt++) {
    const event = createEvent({capacity: 1});
    
    const [r1, r2] = await Promise.all([
      atomicReservation(event._id, user1, 1),
      atomicReservation(event._id, user2, 1)
    ]);
    
    // Exactly one succeeds
    const success = [r1, r2].filter(r => r.status === 'confirmed').length;
    if (success !== 1) {
      throw new Error(`Attempt ${attempt}: expected 1 confirmed, got ${success}`);
    }
  }
});

// Test 2: Timing
test('registration with delayed capacity update', async () => {
  // Simulate slow database
  const slowDb = createSlowDatabase({delay: 500});
  
  // Two registrations with slow DB
  const start = Date.now();
  const result = await atomicReservation(event._id, user, 1, slowDb);
  const elapsed = Date.now() - start;
  
  // Should still work correctly despite delay
  expect(result.status).toBe('confirmed');
  expect(elapsed).toBeGreaterThan(500);  // Waited for slow DB
});

// Test 3: Idempotency
test('retry same registration is idempotent', async () => {
  const idempotencyKey = 'key_123';
  
  // First attempt
  const result1 = await atomicReservation(
    event._id, user, 1, {idempotencyKey}
  );
  
  // Retry with same key
  const result2 = await atomicReservation(
    event._id, user, 1, {idempotencyKey}
  );
  
  // Same result
  expect(result1.registrationId).toBe(result2.registrationId);
  
  // Not double-registered
  const count = await Registration.countDocuments({
    eventId: event._id, userId: user
  });
  expect(count).toBe(1);
});
```

---

# MEDIUM PRIORITY BLIND SPOTS

These indicate areas of incomplete understanding but less likely to cause production issues.

---

## Blind Spot #8: Index Strategy

**What you appear to understand:**
- Indexes make queries fast
- Without index, full scan is slow

**What you're actually missing:**
- Index selection matters (which fields, which order?)
- Composite indexes have specific benefits
- Wrong index can be slower than no index
- Index writes have cost (every insert updates index)

**Why it matters:**
Your queries will slow over time if indexes are wrong.
At 1M registrations, slow queries become obvious.

**Repository-specific example:**

```typescript
// Query: Get registrations for event, filtered by status
db.registrations.find({eventId, status})

// BAD index (wrong order)
db.registrations.createIndex({status: 1, eventId: 1});
// Searches all "confirmed" registrations, THEN filters by eventId
// O(n) where n = total "confirmed" across all events

// GOOD index (right order)
db.registrations.createIndex({eventId: 1, status: 1});
// Searches event first (narrow), THEN filters by status
// O(m) where m = registrations for that event only

// BEST index (includes projection)
db.registrations.createIndex(
  {eventId: 1, status: 1, createdAt: 1},
  {sparse: true}  // Only index confirmed
);
// Can answer query without accessing document
```

**The real gap:**
You know indexes are fast. But not:
- Index ordering (first field = most selective)
- Composite indexes (multiple fields)
- Sparse indexes (null handling)
- TTL indexes (auto-delete old data)
- Index maintenance costs

**Question that exposes the gap:**

> "You have 10M registrations. Query: get all confirmed registrations for event X created in last 24 hours.
> Design the index. What would be slow without it? How does index selection affect write performance?"

**Expected answer for understanding:**
- "Index: {eventId: 1, status: 1, createdAt: -1}"
- "EventId most selective (narrow down to one event)"
- "Status next (confirmed/waitlisted/etc)"
- "CreatedAt last for range query"
- "Without index: scan 10M docs, filter each one (slow)"
- "With index: scan 1K docs in index, fetch only what needed"
- "Cost: Every insert updates 3-field index (slow writes slightly)"

**Practical exercise:**

Design and test index performance:

```typescript
test('index optimization for registration queries', async () => {
  const event = createEvent();
  
  // Create 100K registrations
  await createRegistrations(100000);
  
  // Query 1: All registrations for event
  const start1 = Date.now();
  const query1 = await db.registrations.find({eventId});
  const time1 = Date.now() - start1;
  
  // Without proper index: ~500ms
  // With index {eventId: 1}: ~50ms
  // With index {eventId: 1, status: 1}: ~10ms
  expect(time1).toBeLessThan(50);
  
  // Query 2: Registrations for event by status
  const start2 = Date.now();
  const query2 = await db.registrations.find({
    eventId,
    status: 'confirmed'
  });
  const time2 = Date.now() - start2;
  
  expect(time2).toBeLessThan(20);
});
```

---

## Blind Spot #9: Data Modeling Implications

**What you appear to understand:**
- Store data in database
- Query it back
- Use schema validation

**What you're actually missing:**
Data model choices have far-reaching implications.

Example: Denormalizing capacity counter into event doc.
- Pro: Fast queries (don't count registrations each time)
- Con: Must keep in sync (denormalization debt)
- Con: Concurrency harder (must lock while counting)
- Con: Recovery harder (what if out of sync?)

**Why it matters:**
Early data model decisions compound.
Changing model later is expensive (migration).

**Repository-specific example:**

```typescript
// Option A: Normalized (query time)
Event: {_id, name, capacity}
Registration: {_id, eventId, status}

Query capacity: count registrations WHERE status = 'confirmed'
Cost: O(n) where n = registrations

// Option B: Denormalized (write time)
Event: {_id, name, capacity, registeredCount, waitlistedCount}

Query capacity: read single field
Cost: O(1)
But: Must update counters on every registration change (more complex)

// Option C: Hybrid (split)
Event: {_id, name, capacity, registeredCount}  // Atomic-updated
Analytics: {eventId, hourBucket, metrics: {count, ...}}  // Eventually-consistent

Query for registration: use Event.registeredCount
Query for analytics/reporting: use Analytics
```

**The real gap:**
You chose denormalized model (capacity counter). But do you understand:
- Why you chose it (query speed)
- Cost of maintaining it (complexity)
- Failure scenario (counter out of sync)
- Recovery (when and how to rebuild)
- Alternatives (what if you chose normalized)

**Question that exposes the gap:**

> "Event.registeredCount gets out of sync with actual registration count (some data corruption).
> How do you detect it? How do you fix it? What do you do while broken?"

**Expected answer for understanding:**
- "Detect: SELECT COUNT(*) registrations vs event.registered"
- "Fix: Batch job to recalculate (expensive on large table)"
- "During: Serve stale number (accept inconsistency) or recalculate on-demand (expensive)"
- "Prevent: Transactions ensure sync (but cache can diverge)"
- "Better: Add version counter to detect staleness"

**Practical exercise:**

Implement consistency checking and recovery:

```typescript
test('detect and repair capacity counter inconsistency', async () => {
  const event = createEvent({registered: 100});
  
  // Corrupt the counter (simulate data corruption)
  await Event.updateOne({_id: event._id}, {registeredCount: 95});
  
  // Detect inconsistency
  const actual = await Registration.countDocuments({
    eventId: event._id,
    status: 'confirmed'
  });
  
  const stored = event.registeredCount;
  expect(stored).not.toBe(actual);
  
  // Repair
  await Event.updateOne(
    {_id: event._id},
    {registeredCount: actual}
  );
  
  const repaired = await Event.findById(event._id);
  expect(repaired.registeredCount).toBe(actual);
});
```

---

## Blind Spot #10: Deployment Implications

**What you appear to understand:**
- Code goes to production
- Tests prevent bugs

**What you're actually missing:**
Deployment itself can cause bugs not caught by tests.

Schema migration during zero-downtime deployment.
Old code running alongside new code.
Database state changes.

**Why it matters:**
You can have correct code and breaking deployment.

**Repository-specific example:**

```
Scenario: Add "preferenceType" field to Registration

Code change: registrationSchema.add({preferenceType: String})

Deployment (zero-downtime):
T=0: Deploy new code (version 2)
T=5: Some servers running v2, some still v1
T=10: V1 creates registration WITHOUT preferenceType field
T=15: V2 tries to READ preferenceType (null)
T=20: V2 validation fails: "preferenceType required"
T=25: Query fails, error 500 for guest

Problem: V1 wrote null, V2 expects value
```

**The real gap:**
You understand changes are hard. But not:
- Backward compatibility (new code must handle old data)
- Forward compatibility (old code must not break on new data)
- Canary deployments (gradual rollout)
- Feature flags (enable new code per user)
- Rollback strategy (quick revert if issues)

**Question that exposes the gap:**

> "You want to add phone number field (optional) to registrations.
> Deployment is zero-downtime (old and new code running together).
> What could go wrong? How do you deploy safely?"

**Expected answer for understanding:**
- "V1 creates registration without phone (null)"
- "V2 code might assume phone exists (error)"
- "Solution: Field optional in schema, handle null in code"
- "Or: Database migration BEFORE code deploy"
- "Or: Feature flag to enable new field"
- "Or: Canary deploy to 1% users first"

**Practical exercise:**

Implement safe deployment with schema changes:

```typescript
// Step 1: Add field as OPTIONAL to schema
registrationSchema.add({phoneNumber: {type: String, required: false}});

// Step 2: Deploy code that HANDLES missing field
const getPhoneNumber = (registration) => {
  return registration.phoneNumber || 'not-provided';
};

// Step 3: Only after code deployed and tested, migrate data
const migratePhoneNumbers = async () => {
  await Registration.updateMany(
    {phoneNumber: null},
    {phoneNumber: 'not-provided'}
  );
};

// Test both old and new format
test('code handles both old (null) and new (string) formats', async () => {
  const oldReg = await Registration.create({
    eventId, userId, seats
    // phoneNumber not set (v1 format)
  });
  
  const newReg = await Registration.create({
    eventId, userId, seats,
    phoneNumber: '555-1234'  // v2 format
  });
  
  // Both should work
  expect(getPhoneNumber(oldReg)).toBe('not-provided');
  expect(getPhoneNumber(newReg)).toBe('555-1234');
});
```

---

# LOW PRIORITY BLIND SPOTS

These are refinement areas. System works fine without deep understanding here.

---

## Blind Spot #11: Monitoring Interpretation

**What you appear to understand:**
- Metrics show system behavior
- Graphs look good = system healthy

**What you're actually missing:**
- Metrics can be misleading
- 99th percentile latency matters more than average
- False positives (looks like error, isn't)
- Correlation vs causation

**Example:**
```
Dashboard shows: Average latency 50ms (looks good)
Reality: 1% of requests take 5 seconds (unnoticed in average)
Result: Some users get errors, average metric still green
```

**Quick exercise:**
Design alerting for registration endpoint.
What metrics matter? (not just latency and error rate)

---

## Blind Spot #12: API Versioning

**What you appear to understand:**
- API has endpoints
- Clients call them

**What you're actually missing:**
- What happens when you change API?
- Old clients still making old requests
- How to deprecate gracefully?
- Versioning strategies (URL, header, negotiate)

**Quick question:**
"You want to change registration response format (add field, remove field).
Old mobile app still running (1000 users). How do you roll out change without breaking them?"

---

# SUMMARY: PRIORITIZED BLIND SPOTS

## CRITICAL (Must understand for sound architecture)

1. **Atomic ≠ Consistent** - Transactions alone don't ensure business rules
2. **CDC ≠ Real-time** - Eventually consistent system has implications everywhere
3. **Error Handling ≠ Resilience** - Catching errors doesn't make system resilient

## HIGH (Important for good design)

4. **Eventual Consistency Ordering** - Events might process out of order
5. **Concurrency vs Parallelism** - Understanding scheduler behavior matters
6. **Testing ≠ Coverage** - High coverage can miss critical bugs

## MEDIUM (Affects performance at scale)

7. **Index Strategy** - Wrong indexes slow queries exponentially
8. **Data Modeling** - Early choices compound, hard to change
9. **Deployment Safety** - Code changes cause bugs different from logical bugs

## LOW (Refinements)

10. **Monitoring Interpretation** - Metrics can mislead
11. **API Versioning** - Managing change over time

---

## NEXT STEPS

For each blind spot, there's a:
1. Practical exercise (implement and test)
2. Question to self-check understanding
3. Repository-specific example

**Recommended approach:**
1. Start with CRITICAL blind spots (#1-3)
2. Implement the exercises
3. Try to answer the questions WITHOUT reading answers
4. Compare your answer to expected answer
5. Re-read the blind spot section until you can explain it to someone else

The goal isn't memorization. It's to move from "I've seen this" to "I deeply understand this."

Good luck! 🎯
