# Evenregman - Architecture Change Scenarios

Interactive scenarios that force you to reason about the existing system. Organized by difficulty level, each scenario asks you to make architectural decisions before revealing the ideal solution.

**How to use this guide:**
1. Read the scenario requirement
2. Answer the 6 questions in order
3. Write down your answers
4. Scroll to "Solution Revealed" to see the ideal approach
5. Compare against existing architecture
6. Identify what you missed or would do differently

---

# LEVEL 1: SMALL CHANGES

Small modifications to existing components. You're working within the current architecture, not redesigning it.

---

## Scenario 1.1: Add Seat Preference Field

**Requirement:**
Guests want to indicate seat preferences when registering (e.g., "aisle seat", "near stage", "back row"). The host sees these preferences when reviewing registrations.

Currently, the registration only captures: eventId, userId, seatsRequested, status, confirmedAt.

---

### YOUR TURN

**1. Which components would change?**
- List all files/folders that would need modification
- Be specific about layers (API, service, model, UI, etc.)

**2. Why would those components change?**
- For each component, explain WHY it must change
- What responsibility does it handle?

**3. What risks do you foresee?**
- Data migration issues?
- Performance impact?
- Backwards compatibility?
- UI complexity?

**4. How would you test this?**
- What tests would catch bugs?
- Integration test approach?
- End-to-end scenarios?

**5. What architectural tradeoffs are you making?**
- Storage cost vs query flexibility?
- UI complexity vs usefulness?
- Database denormalization needed?

**6. Would you change the atomic reservation logic? Why or why not?**
- Does the transaction need modification?
- Any new race conditions?

---

### SOLUTION REVEALED

**Ideal Approach:**

**1. Components that change:**

```
Frontend (React):
├─ src/app-premium/(dashboard)/registrations/page.tsx
│  └─ Add preference column to table, detail view
├─ src/components-premium/composite/detail-dock.tsx
│  └─ Show/edit preferences in detail panel
└─ src/hooks-premium/use-registrations.ts
   └─ No change (preferences come with registration)

Backend (Node.js):
├─ src/models/Registration.ts
│  └─ Add preferenceType: enum('aisle', 'stage', 'back')
│     Add preferenceNotes: string (optional)
├─ src/app/api/registrations/route.ts
│  └─ Validate preferences in request
│     Include in response
├─ src/features/registrations/registerForEvent.ts
│  └─ No change (preferences don't affect reservation logic)
└─ src/lib/atomic-reservation.ts
   └─ No change (atomic to registration, not preferences)

Database:
└─ MongoDB registrations collection
   └─ Add new fields to schema
   └─ No migration needed (MongoDB schema-less)
```

**2. Why each changes:**

- **Registration model**: Preferences must be stored
- **API endpoint**: Must accept/validate preferences from frontend
- **UI components**: Preferences must be visible to hosts
- **Detail dock**: Hosts may edit preferences after registration
- **Atomic reservation**: NO CHANGE - preferences don't affect capacity

**3. Risks identified:**

- **Data validation risk**: Invalid preference values could crash host view
  - Mitigation: Use enum in schema, validate on API
  
- **Backwards compatibility**: Existing registrations have no preferences
  - Mitigation: Make preferences optional, default to null
  
- **UI bloat risk**: Too many preferences clutters the table
  - Mitigation: Show in detail view, not main table
  
- **Search complexity**: Hosts want to filter by preference
  - Mitigation: Add MongoDB index on preferenceType

**4. Testing approach:**

```
Unit tests:
- Validate preference enum values
- Test optional preference (null handling)

Integration tests:
- Register with preferences → Verify stored correctly
- Retrieve registration → Preferences included
- Update registration → Can change preferences
- Existing registration → No preferences field (null)

End-to-end tests:
- Guest registers with preferences
- Host views preferences in detail dock
- Host exports registrations (preferences included)
```

**5. Architectural tradeoffs:**

| Aspect | Choice | Tradeoff |
|--------|--------|----------|
| **Storage** | Store in registration doc | No separate table, denormalized data |
| **Validation** | Enum on model | Inflexible (hard to add new preferences) |
| **UI** | Detail view, not table column | Cleaner table, less scannable |
| **Query** | Index on preferenceType | Slightly slower writes |
| **Analytics** | CDC projects preferences to analytics DB | Pre-aggregation: "10 aisle preferences for event X" |

**6. Does atomic reservation logic change?**

**NO.** Preferences don't affect:
- Capacity checking (still based on seatsRequested)
- Waitlist logic (preferences don't matter)
- Confirmation logic (independent of preference)

Preferences are pure metadata, not capacity-related.

---

**Comparison to Existing Architecture:**

| Current | New |
|---------|-----|
| Registration = {eventId, userId, seatsRequested, status} | Registration = {eventId, userId, seatsRequested, status, preferenceType, preferenceNotes} |
| Atomic engine only cares about seatsRequested | Atomic engine unchanged (preferences orthogonal) |
| Dashboard shows 5 columns | Dashboard shows same 5 columns + detail view includes preferences |
| No preference-based filtering | Can filter by preferenceType in MongoDB query |
| CDC projects {count, seatsRequested} | CDC projects {count, seatsRequested, preferenceBreakdown} |

**What might you have missed:**

1. **Didn't change atomic reservation** - Correct! Preferences don't affect capacity
2. **Forgot CDC impact** - Preferences should be pre-aggregated for analytics
3. **Didn't consider query performance** - Need index on (eventId, preferenceType)
4. **UI decisions** - Detail view vs table column affects usability
5. **Enum flexibility** - Hardcoded preferences inflexible, consider config later

---

## Scenario 1.2: Add Rate Limiting Per User

**Requirement:**
Prevent registration spam. Guests can only register for at most 10 events per day. After 10, they get 429 "Too Many Requests" and must wait until tomorrow.

Currently, registration endpoint has no rate limiting.

---

### YOUR TURN

**1. Where would you implement rate limiting?**
- API middleware, service layer, or external service?
- Why that location?

**2. What data structure tracks attempts?**
- How do you store "10 registrations per day per user"?
- Where does this state live (Redis, memory, database)?

**3. What happens at midnight?**
- Do you reset counters daily?
- Timezone implications?
- Clock skew handling?

**4. How would you test this?**
- Unit test approach?
- Integration test (actual clock or mock)?
- Race condition testing?

**5. Does this affect atomic reservation logic?**
- Where does rate limit check run relative to transaction?
- What if limit reached DURING registration attempt?

**6. What if Redis (rate limit store) is down?**
- Fail open (allow all) or fail closed (reject all)?
- Implications?

---

### SOLUTION REVEALED

**Ideal Approach:**

**1. Implementation location: API middleware (before handler)**

```typescript
// src/middleware.ts or src/app/api/registrations/middleware.ts

app.post('/api/registrations', 
  authMiddleware,           // Verify user
  rateLimitMiddleware,      // Check rate limit BEFORE service
  registrationHandler       // Handle registration
);
```

**Why middleware?**
- Fails fast (don't do work if rate limited)
- Applied to all registration attempts (consistent)
- Separation of concerns (rate limiting is cross-cutting)

**2. Data structure for tracking:**

```typescript
// Redis key structure
const key = `rate-limit:registration:${userId}:${dateString}`;
// Value: number of registrations today

// At each attempt:
const count = await redis.incr(key);
if (count > 10) throw new RateLimitError();

// Set expiry when first created
if (count === 1) {
  await redis.expireAt(key, endOfDayTimestamp);
}
```

**Why Redis?**
- Atomic increment operation (no race conditions)
- Expiry built-in (automatic daily reset)
- Sub-millisecond performance
- Memory efficient (only 1 number per user per day)

**3. Handling daily reset:**

```typescript
// Generate date string for "today"
const getDateString = (now = new Date(), timezone = 'UTC') => {
  // Convert to user's timezone, get YYYY-MM-DD
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(now);  // "2024-08-14"
};

// Separate keys for different timezones if needed
const key = `rate-limit:registration:${userId}:${timezone}:${dateString}`;
```

**Timezone consideration:**
- Option A: Everyone uses UTC (simple, but unfair to timezone extremes)
- Option B: Per-user timezone (complex, need to store timezone)
- Current choice: UTC (acceptable tradeoff for simplicity)

**4. Testing approach:**

```typescript
// Unit test
test('rate limit allows 10 registrations per day', () => {
  for (let i = 0; i < 10; i++) {
    expect(checkRateLimit()).toBe(true);
  }
  expect(checkRateLimit()).toBe(false);  // 11th rejected
});

// Integration test with mock clock
test('rate limit resets at midnight', async () => {
  // Advance clock past midnight
  const tomorrow = new Date(now.getTime() + 24 * 3600 * 1000);
  jest.useFakeTimers();
  jest.setSystemTime(tomorrow);
  
  // Counter should reset
  expect(getRateLimit(userId)).toBe(0);
});

// Race condition test
test('concurrent registrations increment atomically', async () => {
  const promises = [];
  for (let i = 0; i < 5; i++) {
    promises.push(checkRateLimit(userId));
  }
  const results = await Promise.all(promises);
  expect(redis.get(key)).toBe(5);  // All incremented correctly
});
```

**5. Relationship to atomic reservation:**

Rate limit check must run BEFORE atomic transaction:

```
Request arrives
  ↓
Auth check ✓
  ↓
Rate limit check (Redis) ← BEFORE transaction
  ├─ If limited: Return 429 immediately
  ├─ If OK: Increment counter
  ↓
Atomic transaction starts (MongoDB)
  ├─ Check capacity
  ├─ Create registration
  ├─ Update counter
  ↓
Commit
  ↓
Response sent
```

**Why before?**
- If check ran after, you'd still consume a capacity slot before rejecting
- Would need to rollback transaction on rate limit (wasteful)

**6. If Redis is down (failure handling):**

Recommendation: **Fail open (allow all registrations)**

```typescript
const getRateLimit = async (userId) => {
  try {
    const count = await redis.incr(key);
    return count <= 10;
  } catch (error) {
    // Redis down
    console.warn('Rate limit check failed:', error);
    return true;  // Allow registration
  }
};
```

**Why fail open?**
- Guest experience: Can register (good)
- Host experience: Slightly more spam (minor issue)

**Alternative: Fail closed (reject all)**
- Guest experience: Can't register (bad)
- Host experience: No spam (good)
- Usually worse because users blame you for outage

**Tradeoff:** Brief period of no rate limiting vs guests blocked completely.

---

**Comparison to Existing Architecture:**

| Aspect | Before | After |
|--------|--------|-------|
| **Rate limiting** | None | Redis-based per-user daily limit |
| **Data flow** | Auth → Atomic reservation | Auth → **Rate limit (Redis)** → Atomic reservation |
| **Failure mode** | N/A | Redis down → allow all (graceful degradation) |
| **Performance** | Atomic reservation ~50ms | Rate limit ~1ms + Atomic ~50ms = ~51ms (negligible) |
| **Capacity** | No waste | Rate limit check prevents wasted transactions |

**What might you have missed:**

1. **Middleware vs service layer** - Middleware better (fail fast before work)
2. **Redis not database** - Redis has atomic increment, database doesn't
3. **Timezone complexity** - UTC simplification acceptable
4. **Expiry handling** - Must auto-reset daily with Redis TTL
5. **Fail-open behavior** - Graceful degradation better than blocking users
6. **Ordering**: Rate limit before transaction (not after)

---

## Scenario 1.3: Add Email Verification

**Requirement:**
Guest provides email when registering. They must verify ownership (click link in email) before registration is confirmed. Unverified registrations are "pending" status.

Currently: Registration is immediately "confirmed" if capacity allows.

---

### YOUR TURN

**1. How does this change the atomic reservation?**
- Does capacity get reserved for pending registrations?
- Or only for confirmed?

**2. When does confirmation happen?**
- Guest clicks email link → confirmed immediately?
- Or human admin approves?

**3. What happens to email delivery?**
- Current system: Email queued (may fail)
- New requirement: Email must be received for confirmation
- How do you handle email failures?

**4. Dashboard implications:**
- How do hosts see pending registrations?
- Can they manually confirm?
- Can they delete pending?

**5. Expiry logic:**
- Pending registrations expire after X days?
- Seat becomes available if not verified?

**6. How would you test verification flow?**
- End-to-end (email included)?
- Mock email service?

---

### SOLUTION REVEALED

**Ideal Approach:**

**1. Atomic reservation timing:**

```typescript
// Registration states
enum RegistrationStatus {
  PENDING = 'pending',         // Email sent, awaiting verification
  CONFIRMED = 'confirmed',     // Verified or auto-confirmed
  CANCELLED = 'cancelled',
  EXPIRED = 'expired'          // Pending expired
}

// PENDING registrations DO NOT count toward capacity
const getAvailableCapacity = (event) => {
  const registeredCount = event.registrations
    .filter(r => r.status === 'confirmed')  // Only confirmed
    .reduce((sum, r) => sum + r.seatsRequested, 0);
  
  return event.capacity - registeredCount;
};
```

**Why?**
- If pending counted, guest verifies late, seats already taken
- Creates negative experience (reserved seats disappear)
- Better: Reserve only after verification

**2. Confirmation timing and flow:**

```
Guest registers
  ↓
Status: PENDING
  ↓
Email sent (Outbox pattern)
  ↓
Guest opens email in 7 days window
  ↓
Clicks link with token
  ↓
POST /api/verify-registration/:token
  ↓
Check token valid & not expired
  ↓
Update registration status → CONFIRMED
  ↓
Now counts toward capacity
  ↓
Host sees "recently confirmed" in dashboard

If 7 days pass without verification:
  ↓
Background job marks as EXPIRED
  ↓
No longer counts (was never reserved anyway)
```

**3. Email delivery handling:**

```typescript
// In atomic transaction (same as before)
await session.startTransaction();

await Registration.create({
  ...
  status: 'pending',
  verificationToken: generateToken(),
  verificationSentAt: now,
  verificationExpiresAt: now + 7 days
}, {session});

// Queue email in Outbox (same transaction)
await Outbox.create({
  type: 'RegistrationVerificationEmail',
  data: {registrationId, email, verificationUrl},
  status: 'pending'
}, {session});

await session.commitTransaction();
```

**Failure handling:**
- Email service down: Outbox retries (existing pattern)
- Email bounces: Manual verification needed (call host)
- No action: Auto-expire after 7 days

**4. Dashboard changes:**

```
Host sees:
├─ "Confirmed" registrations (counted toward capacity)
├─ "Pending" registrations (awaiting verification)
│  ├─ Can manually confirm (skip email)
│  ├─ Can delete (free up seat)
│  └─ Shows time since sent
└─ "Expired" registrations (archived)
   └─ Can delete or re-invite

New columns in table:
├─ Status badge (pending/confirmed/expired)
├─ Email address (click to resend verification)
└─ Verification age (sent X days ago)
```

**5. Expiry logic:**

```typescript
// Cron job (runs daily at 3 AM)
const expireVerifications = async () => {
  const expiredDate = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  
  await Registration.updateMany(
    {
      status: 'pending',
      verificationSentAt: {$lt: expiredDate}
    },
    {status: 'expired'},
    {multi: true}  // No transaction needed, not capacity-affecting
  );
};
```

**Why separate job?**
- Doesn't need atomicity (pending never reserved capacity)
- Runs in background
- Doesn't block registrations

**6. Testing approach:**

```typescript
// Unit test
test('pending registrations do not count toward capacity', () => {
  const event = createEvent({capacity: 100});
  createRegistration({status: 'confirmed', seats: 50});
  createRegistration({status: 'pending', seats: 40});
  
  expect(getAvailableCapacity(event)).toBe(50);  // Only confirmed counts
});

// Integration test
test('verification flow: pending → confirmed', async () => {
  const reg = await register(userId, eventId);
  expect(reg.status).toBe('pending');
  expect(getAvailableCapacity(eventId)).toBe(originalCapacity);
  
  await verifyEmail(reg.verificationToken);
  const verified = await getRegistration(reg._id);
  expect(verified.status).toBe('confirmed');
  expect(getAvailableCapacity(eventId)).toBe(originalCapacity - seatsRequested);
});

// End-to-end (with mock email)
test('guest can register and verify', async () => {
  const response = await postRegister({eventId, seatsRequested: 2});
  expect(response.status).toBe('pending');
  
  const email = getLastEmail(guestEmail);
  const match = email.body.match(/verify\/(\w+)/);
  const token = match[1];
  
  await postVerify(token);
  const confirmed = await getRegistration(response._id);
  expect(confirmed.status).toBe('confirmed');
});

// Expiry test
test('pending registrations expire after 7 days', async () => {
  const reg = await register(userId, eventId);
  
  // Advance time 8 days
  jest.useFakeTimers();
  jest.advanceTimersByTime(8 * 24 * 3600 * 1000);
  
  await expireVerifications();
  const expired = await getRegistration(reg._id);
  expect(expired.status).toBe('expired');
});
```

---

**Comparison to Existing Architecture:**

| Component | Before | After |
|-----------|--------|-------|
| **Atomic reservation** | Confirm immediately | Confirm only after verification |
| **Registration status** | confirmed/cancelled | pending/confirmed/cancelled/expired |
| **Capacity calculation** | Includes all confirmed | Includes only verified confirmed |
| **Outbox usage** | Email confirmation | Email verification (same pattern) |
| **Background jobs** | Job queue (email sending) | Cron job (expire pending) |
| **Email flow** | Single email (confirmation) | Two emails possible (verification + reminder) |
| **Dashboard complexity** | Simple (2 states) | Moderate (4 states) |

**What might you have missed:**

1. **Pending shouldn't reserve capacity** - Key decision (affects fairness)
2. **Uses existing Outbox pattern** - Leverages infrastructure
3. **Separate expiry job** - Not atomic, doesn't need transaction
4. **Manual override** - Host can confirm without email
5. **Re-invite emails** - Can resend verification link multiple times
6. **Token security** - Should include user identifier + HMAC for validation

---

# LEVEL 2: FEATURE CHANGES

Larger modifications that change user workflows and business logic.

---

## Scenario 2.1: Add Event Categories with Auto-Approval

**Requirement:**
Different event categories have different approval rules:
- **Free events**: Registrations auto-approved
- **Paid events**: Require admin approval before confirmation
- **VIP events**: Require host approval + special pricing

A guest registers, but confirmation timing depends on event category and approval workflow.

---

### YOUR TURN

**1. How does this change atomic reservation?**
- Still need ACID transaction?
- Does category affect capacity reservation?

**2. Where does approval happen?**
- When registration created but pending approval?
- Reservation waiting for approval?
- Or create registration only after approval?

**3. What are the approval roles?**
- Guest: registers
- Host: owns event
- Admin: reviews paid events
- Who approves what?

**4. Notification requirements:**
- Guests notified when approved/rejected?
- Admin notified new pending approval?
- Host notified of VIP approval status?

**5. Capacity management:**
- Pending approval takes a seat?
- Can event be "full" with pending registrations?

**6. Backwards compatibility:**
- Existing events have no category
- How do you handle them?

---

### SOLUTION REVEALED

**Ideal Approach:**

**1. Atomic reservation with conditional approval:**

```typescript
// Event schema
enum EventCategory {
  FREE = 'free',           // Auto-approved
  PAID = 'paid',           // Admin approval
  VIP = 'vip'              // Host + Admin approval
}

// Registration schema
enum RegistrationStatus {
  PENDING_APPROVAL = 'pending_approval',  // Waiting for approval
  APPROVED = 'approved',                   // Approved, seat reserved
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired'
}

// Atomic transaction still needed!
// Because we need to atomically:
// 1. Create registration
// 2. Update category-specific counters
// 3. Maybe update approval queue

const atomicReservation = async (eventId, userId, seats, session) => {
  const event = await Event.findById(eventId, null, {session});
  
  if (event.category === 'free') {
    // Auto-approve: Check capacity
    if (event.approvedCount + seats > event.capacity) {
      throw new CapacityError();
    }
    
    const registration = await Registration.create({
      eventId, userId, seats,
      status: 'approved',
      approvedAt: now
    }, {session});
    
    event.approvedCount += seats;
    await event.save({session});
    
    return registration;  // Confirmed immediately
  }
  
  if (event.category === 'paid' || event.category === 'vip') {
    // Manual approval: Don't check capacity yet
    // (multiple pending shouldn't block each other)
    
    const registration = await Registration.create({
      eventId, userId, seats,
      status: 'pending_approval',
      submittedAt: now
    }, {session});
    
    // Add to approval queue
    await ApprovalQueue.create({
      registrationId: registration._id,
      eventId, userId,
      approverRole: event.category === 'paid' ? 'admin' : 'host',
      priority: event.category === 'vip' ? 'high' : 'normal'
    }, {session});
    
    return registration;  // Approval needed
  }
};
```

**Why still atomic?**
- Approval queue is part of state
- ApprovalQueue and Registration must both create together
- Otherwise, approval can be lost

**2. Approval workflow:**

```
Free event:
  Register → Approved immediately → Counts toward capacity ✓

Paid event:
  Register → Pending approval
    ↓
  Admin dashboard shows pending
    ↓
  Admin approves/rejects
    ↓
  Guest notified (approved → seat reserved, rejected → no seat)

VIP event:
  Register → Pending approval
    ↓
  Host approves first
    ↓
  Admin approval queue shows (optional secondary check)
    ↓
  Guest notified final status
```

**Capacity only reserved after APPROVED**, not pending.

```typescript
// Only count approved toward capacity
const getAvailableCapacity = (event) => {
  const approvedCount = event.registrations
    .filter(r => r.status === 'approved')
    .reduce((sum, r) => sum + r.seats, 0);
  
  return event.capacity - approvedCount;
};
```

**3. Approval roles and permissions:**

```typescript
// Permission model
const approvalRules = {
  'free': {
    approverRole: null,        // No approval needed
    autoApprove: true
  },
  'paid': {
    approverRole: 'admin',     // Admin approves
    priority: 'normal'
  },
  'vip': {
    approverRoles: ['host', 'admin'],  // Host first, then admin
    priority: 'high'
  }
};

// Approval flow
const approveRegistration = async (registrationId, userId, session) => {
  const registration = await Registration.findById(registrationId, null, {session});
  const event = await Event.findById(registration.eventId, null, {session});
  const approval = await ApprovalQueue.findOne({registrationId}, null, {session});
  
  // Check permission
  if (event.category === 'paid') {
    if (userId !== adminUser) throw new UnauthorizedError();
  } else if (event.category === 'vip') {
    if (userId !== event.hostId && userId !== adminUser) {
      throw new UnauthorizedError();
    }
  }
  
  // Update status
  registration.status = 'approved';
  registration.approvedAt = now;
  event.approvedCount += registration.seats;
  
  await registration.save({session});
  await event.save({session});
  await ApprovalQueue.deleteOne({_id: approval._id}, {session});
};
```

**4. Notifications:**

```typescript
// After approval (in same transaction)
await Outbox.create({
  type: 'RegistrationApproved',
  data: {
    registrationId,
    userId: registration.userId,
    email: guest.email,
    eventName: event.name
  }
}, {session});

// After rejection
await Outbox.create({
  type: 'RegistrationRejected',
  data: {registrationId, reason: 'Manual rejection'},
}, {session});

// When pending (admin only)
await Outbox.create({
  type: 'AdminApprovalNeeded',
  data: {registrationId, eventCategory: 'paid'},
  recipientRole: 'admin'
}, {session});
```

**5. Capacity management:**

```
Scenario: Event capacity = 100, 95 approved + 20 pending approvals

Available = 100 - 95 = 5 seats

If new guest tries to register:
├─ Event shows "5 seats available"
├─ Guest registers
├─ Registration is pending_approval
├─ Does NOT count toward the 5

If admin approves 10 pending:
├─ Approved count = 95 + 10 = 105
├─ EXCEEDS capacity!
├─ Solution: Approval checks remaining capacity
```

**6. Backwards compatibility:**

```typescript
// Existing events created before categories
// Default to 'free' for safety
const getEventCategory = (event) => {
  return event.category || 'free';  // Default to auto-approve
};

// Migration job (optional, for data consistency)
const migrateEventCategories = async () => {
  await Event.updateMany(
    {category: null},
    {category: 'free'},  // Existing events auto-approve
    {multi: true}
  );
};
```

---

**Comparison to Existing Architecture:**

| Aspect | Before | After |
|--------|--------|-------|
| **Registration status** | approved/rejected | approved/rejected/pending_approval/... |
| **Capacity** | Counts all approved | Still counts approved (pending separate) |
| **Approval flow** | Auto (implicit) | Event-category-dependent |
| **Roles** | host/admin | + approval workflows per category |
| **Database** | 1 approval (immediate) | 1 approval (maybe after queue) |
| **Complexity** | Simple | Moderate (approval states) |

**What might you have missed:**

1. **Atomic transaction still needed** - Approval queue is part of state
2. **Capacity not reserved for pending** - Prevents double-booking
3. **Different approvers per category** - Admin vs host approval
4. **Notification cascade** - Guest, host, admin all need updates
5. **Priority handling** - VIP should be approved first
6. **Backwards compatibility** - Default to free/auto-approve

---

## Scenario 2.2: Add Guest Cancellation with Refunds

**Requirement:**
Guests can cancel their registration up to 48 hours before the event. If they cancel:
- Seat released (capacity restored)
- If paid event, refund processed (percentage based on how close to event)
- Host notified
- Email confirmation sent

Currently: No cancellation support.

---

### YOUR TURN

**1. How does cancellation affect capacity?**
- Immediate release or delayed?
- Waitlist logic (notify waiting guests)?

**2. Refund logic:**
- Who calculates refund percentage?
- When does money move?
- What if refund fails?

**3. Notifications:**
- Guest → confirmation email
- Host → pending notification
- Waitlist → "seat available now"
- How ordered?

**4. Audit trail:**
- What's logged for compliance?
- Who cancelled and when?
- Reason tracking?

**5. Edge cases:**
- Cancel within 48 hours (no refund)?
- Cancel after event started (rejected)?
- Cancel already-cancelled registration?

**6. How do you test concurrent cancellations?**
- Multiple guests cancel same event?
- Capacity updates correctly?

---

### SOLUTION REVEALED

**Ideal Approach:**

**1. Cancellation with atomic capacity release:**

```typescript
// Registration cancellation endpoint
const cancelRegistration = async (registrationId, userId, session) => {
  await session.startTransaction();
  
  try {
    const registration = await Registration.findById(registrationId, null, {session});
    
    // Validations
    if (registration.status !== 'approved') {
      throw new InvalidStateError('Cannot cancel non-approved registration');
    }
    
    if (registration.userId.toString() !== userId.toString()) {
      throw new ForbiddenError('Can only cancel own registration');
    }
    
    const event = await Event.findById(registration.eventId, null, {session});
    const now = new Date();
    const timeTillEvent = event.startDate - now;
    const CANCELLATION_WINDOW = 48 * 3600 * 1000;  // 48 hours in ms
    
    if (timeTillEvent < 0) {
      throw new InvalidStateError('Event already started');
    }
    
    // Atomic update
    registration.status = 'cancelled';
    registration.cancelledAt = now;
    registration.refundStatus = 'pending_calculation';
    
    await registration.save({session});
    
    // Release capacity atomically
    event.approvedCount -= registration.seats;
    await event.save({session});
    
    // Calculate refund
    const refundPercentage = calculateRefund(timeTillEvent, CANCELLATION_WINDOW);
    const refundAmount = registration.amountPaid * (refundPercentage / 100);
    
    // Record refund transaction (for audit)
    await RefundTransaction.create({
      registrationId: registration._id,
      amount: refundAmount,
      percentage: refundPercentage,
      status: 'pending',
      requestedAt: now
    }, {session});
    
    // Queue notifications (Outbox pattern)
    await Outbox.create({
      type: 'GuestCancellationConfirmed',
      data: {
        registrationId: registration._id,
        guestEmail: registration.guestEmail,
        refundAmount,
        eventName: event.name
      }
    }, {session});
    
    await Outbox.create({
      type: 'HostCancellationNotification',
      data: {
        eventId: event._id,
        hostEmail: event.hostEmail,
        registrationName: registration.guestName,
        seats: registration.seats
      }
    }, {session});
    
    // Notify waitlisted guests (if any)
    const waitlisted = await Registration.find({
      eventId: event._id,
      status: 'waitlisted'
    }, null, {session}).limit(registration.seats);
    
    for (const waitlistedReg of waitlisted) {
      await Outbox.create({
        type: 'WaitlistPromotionNotification',
        data: {
          registrationId: waitlistedReg._id,
          guestEmail: waitlistedReg.guestEmail,
          eventName: event.name,
          availableSeats: registration.seats
        }
      }, {session});
    }
    
    await session.commitTransaction();
    
  } catch (error) {
    await session.abortTransaction();
    throw error;
  }
};

// Calculate refund percentage based on time until event
const calculateRefund = (timeTillEvent, cancellationWindow) => {
  if (timeTillEvent > cancellationWindow) {
    return 100;  // 100% refund (outside 48-hour window)
  } else if (timeTillEvent > 0) {
    // 0-48 hours: sliding scale
    const percentageLeft = (timeTillEvent / cancellationWindow) * 50;
    return 50 + percentageLeft;  // 50-100%
  } else {
    return 0;  // No refund (event already started)
  }
};
```

**2. Refund processing:**

```typescript
// Separate worker job (asynchronous)
// runs after cancellation confirmed

const processRefunds = async () => {
  const pending = await RefundTransaction.find({status: 'pending'}).limit(100);
  
  for (const refund of pending) {
    try {
      const result = await paymentGateway.refund({
        transactionId: refund.registrationId,
        amount: refund.amount
      });
      
      refund.status = 'completed';
      refund.processedAt = now;
      refund.paymentRefId = result.refundId;
      
      await refund.save();
      
      // Notify guest of completed refund
      await Outbox.create({
        type: 'RefundProcessed',
        data: {
          registrationId: refund.registrationId,
          amount: refund.amount
        }
      });
      
    } catch (error) {
      refund.status = 'failed';
      refund.error = error.message;
      await refund.save();
      
      // Notify support of failed refund
      await Outbox.create({
        type: 'RefundFailure',
        data: {registrationId: refund.registrationId},
        recipientRole: 'support'
      });
    }
  }
};
```

**Why async?**
- Refund may take seconds (payment gateway latency)
- Cancellation should confirm immediately
- Refund status tracked separately for recovery

**3. Notification ordering (in same transaction):**

All in Outbox, same transaction:
```
1. GuestCancellationConfirmed (immediate email)
2. HostCancellationNotification (immediate email)
3. WaitlistPromotionNotification (immediate email)
4. RefundTransaction created (status=pending)
```

All fail together or all succeed (no partial state).

**4. Audit trail:**

```typescript
// AuditLog entry (automatic via Outbox)
await AuditLog.create({
  action: 'REGISTRATION_CANCELLED',
  resourceType: 'Registration',
  resourceId: registration._id,
  userId: userId,  // Guest cancelling
  changes: {
    status: {before: 'approved', after: 'cancelled'},
    capacity: {
      before: event.approvedCount,
      after: event.approvedCount - registration.seats
    },
    refund: {
      amount: refundAmount,
      percentage: refundPercentage
    }
  },
  timestamp: now
});
```

**5. Edge cases handled:**

```typescript
// Can't cancel if:
if (registration.status !== 'approved') {
  throw new InvalidStateError();  // Already cancelled or pending
}

if (new Date() > event.startDate) {
  throw new InvalidStateError();  // Event started
}

if (new Date() > event.startDate - EARLY_BIRD_WINDOW) {
  // Within cancellation window, but no refund
  refundPercentage = calculateRefund(...);  // May be < 100%
}

// Can't cancel twice
const alreadyCancelled = await Registration.findOne({
  _id: registrationId,
  status: 'cancelled'
});
if (alreadyCancelled) {
  throw new AlreadyCancelledError();
}
```

**6. Testing concurrent cancellations:**

```typescript
// Race condition test
test('concurrent cancellations update capacity correctly', async () => {
  const event = createEvent({capacity: 100, approved: 90});
  const reg1 = createRegistration({seats: 5});
  const reg2 = createRegistration({seats: 5});
  
  // Both cancel simultaneously
  const [result1, result2] = await Promise.all([
    cancelRegistration(reg1._id, user1),
    cancelRegistration(reg2._id, user2)
  ]);
  
  const updatedEvent = await Event.findById(event._id);
  expect(updatedEvent.approvedCount).toBe(80);  // 90 - 5 - 5
});
```

---

**Comparison to Existing Architecture:**

| Aspect | Before | After |
|--------|--------|-------|
| **Registration lifecycle** | Created → Approved → (ends) | Created → Approved → Cancelled |
| **Capacity** | Increased once (creation) | Can decrease (cancellation) |
| **Refunds** | N/A | Calculated + queued for processing |
| **Notifications** | Registration confirmation | + Cancellation + Refund status |
| **Waitlist logic** | None | Promote on cancellation |
| **Audit trail** | Registrations only | + Cancellations + Refunds |
| **Complexity** | Simple | Moderate (refund async) |

**What might you have missed:**

1. **Atomic release of capacity** - Must happen in same transaction
2. **Refund async processing** - Can't block cancellation confirmation
3. **Waitlist promotion** - Notification needed when seats free up
4. **Refund calculation window** - Sliding scale (not all-or-nothing)
5. **Edge case: Event already started** - Must reject
6. **Partial refunds** - May not be 100% (time-based)

---

# LEVEL 3: INFRASTRUCTURE CHANGES

Changing how data flows, where it's stored, or how services communicate.

---

## Scenario 3.1: Replace MongoDB with PostgreSQL

**Requirement:**
The company wants to standardize on PostgreSQL for all services. Replace MongoDB with PostgreSQL while keeping the same functionality.

Must maintain:
- Atomic transactions
- Change Data Capture (CDC)
- Query performance
- No downtime during migration

---

### YOUR TURN

**1. What's the migration strategy?**
- Running both databases in parallel?
- Cutover date?
- How to handle inconsistency?

**2. How does CDC change?**
- MongoDB oplog → PostgreSQL WAL (Write-Ahead Log)?
- Can you use existing CDC worker?
- New tools needed?

**3. What about schema flexibility?**
- MongoDB: flexible documents
- PostgreSQL: strict schemas
- How do you handle event metadata variations?

**4. Atomic transactions:**
- PostgreSQL has ACID (better than MongoDB)
- Need to refactor?
- Simpler or more complex?

**5. Query patterns:**
- MongoDB: aggregation pipeline
- PostgreSQL: SQL
- Dashboard queries change how?

**6. Backwards compatibility:**
- Existing MongoDB data?
- How long to support both?
- Rollback plan if something breaks?

---

### SOLUTION REVEALED

**Ideal Approach:**

**1. Migration strategy (parallel dual-write):**

```
Phase 1 (Week 1-2): Setup
├─ Create PostgreSQL schema (mirror MongoDB)
├─ Set up dual-write infrastructure
└─ Start replicating existing data

Phase 2 (Week 2-4): Shadow traffic
├─ All writes go to both MongoDB + PostgreSQL
├─ Reads still from MongoDB
├─ Compare consistency (automated reconciliation)
├─ Fix any divergences

Phase 3 (Week 4-5): Cutover
├─ Final PostgreSQL sync
├─ Switch reads to PostgreSQL
├─ Monitor for issues
└─ Keep MongoDB as backup (read-only)

Phase 4 (Week 5-6): Decommission
├─ Confirm no need to revert
├─ Archive MongoDB
└─ Remove dual-write code
```

**Dual-write implementation:**

```typescript
// Create abstraction layer (Repository pattern already exists)
const createRegistration = async (data) => {
  try {
    // Write to PostgreSQL (new primary)
    const pgResult = await postgres.registrations.create(data);
    
    // Write to MongoDB (fallback)
    try {
      await mongodb.registrations.create({...data, _id: pgResult.id});
    } catch (mongoError) {
      // Log divergence but don't fail
      console.warn('MongoDB write failed:', mongoError);
      await DivergenceLog.create({
        operation: 'create',
        resourceId: pgResult.id,
        dbFailed: 'mongodb'
      });
    }
    
    return pgResult;
  } catch (pgError) {
    // PostgreSQL failed, retry
    throw pgError;
  }
};
```

**2. CDC changes:**

**MongoDB approach (current):**
```
MongoDB oplog → CDC worker → Analytics DB
(polling every 5 seconds)
```

**PostgreSQL approach (new):**
```
PostgreSQL WAL → Debezium CDC → Kafka → CDC worker → Analytics DB
(streaming, near real-time)
```

**Debezium advantage:** Built for PostgreSQL WAL, not polling needed.

```typescript
// New CDC worker with Debezium
const connectDebezium = async () => {
  const kafka = new Kafka({brokers: ['kafka:9092']});
  const consumer = kafka.consumer({groupId: 'cdc-analytics'});
  
  await consumer.subscribe({topic: 'postgres.public.registrations'});
  
  await consumer.run({
    eachMessage: async ({message}) => {
      const change = JSON.parse(message.value);
      
      // Same projection logic
      await projectToAnalytics(change);
    }
  });
};
```

**But** if you want to avoid Debezium complexity, use **polling on serial numbers:**

```typescript
// Alternative: Polling approach (simpler but less efficient)
setInterval(async () => {
  const lastSerial = await getLastProcessedSerial();
  
  const changes = await postgres.query(
    'SELECT * FROM registrations WHERE xmin > $1 ORDER BY xmin',
    [lastSerial]
  );
  
  for (const change of changes) {
    await projectToAnalytics(change);
  }
  
  await saveLastProcessedSerial(changes[changes.length - 1].xmin);
}, 5000);
```

**Recommendation:** Use Debezium for real-time, but simpler polling approach for migration period.

**3. Schema flexibility:**

**MongoDB (current):**
```javascript
{
  _id: ObjectId,
  eventId: ObjectId,
  customField: "varies by host"  // Flexible
}
```

**PostgreSQL (need to decide):**

Option A: **Strict schema**
```sql
CREATE TABLE registrations (
  id UUID PRIMARY KEY,
  event_id UUID NOT NULL,
  custom_data JSONB,  -- Store flexible fields here
  created_at TIMESTAMP
);
```

Option B: **Separate table for metadata**
```sql
CREATE TABLE registrations (
  id UUID PRIMARY KEY,
  event_id UUID NOT NULL
);

CREATE TABLE registration_metadata (
  registration_id UUID,
  key VARCHAR,
  value JSONB,
  FOREIGN KEY (registration_id) REFERENCES registrations
);
```

**Recommendation:** Option A (JSONB column for custom fields). Simpler, PostgreSQL handles well.

**4. Atomic transactions (simpler!):**

**MongoDB (current):**
```typescript
const session = await mongoose.startSession();
session.startTransaction();
try {
  // Operations
  await session.commitTransaction();
} catch {
  await session.abortTransaction();
}
```

**PostgreSQL (better):**
```typescript
const client = await pool.connect();
await client.query('BEGIN');
try {
  // Operations
  await client.query('COMMIT');
} catch {
  await client.query('ROLLBACK');
}
```

**Actually simpler in PostgreSQL** - no session management needed.

**5. Query pattern changes:**

**MongoDB aggregation (current):**
```typescript
await db.registrations.aggregate([
  {$match: {eventId: ObjectId(eventId), status: 'confirmed'}},
  {$group: {_id: null, count: {$sum: 1}}}
]);
```

**PostgreSQL SQL (new):**
```typescript
const result = await db.query(
  'SELECT COUNT(*) FROM registrations WHERE event_id = $1 AND status = $2',
  [eventId, 'confirmed']
);
```

**Much simpler!** SQL is more readable than aggregation pipeline.

**Migration complexity:**
- Change all queries
- Test thoroughly
- Same behavior but different syntax

**6. Backwards compatibility & rollback:**

```typescript
// Gradual cutover approach
const READ_SOURCE = process.env.READ_DB || 'mongodb';  // Config

const getRegistration = async (id) => {
  if (READ_SOURCE === 'postgresql') {
    return await postgres.registrations.findById(id);
  } else {
    return await mongodb.registrations.findById(id);
  }
};

// Can flip READ_SOURCE config without code deploy
// If PostgreSQL broken: just change config, back to MongoDB
```

**Rollback plan:**
1. Keep MongoDB running (read-only) for 2 weeks after cutover
2. If PostgreSQL has bugs, flip READ_SOURCE back
3. After 2 weeks, no more MongoDB
4. Archive MongoDB data to S3

---

**Comparison to Existing Architecture:**

| Aspect | MongoDB | PostgreSQL |
|--------|---------|------------|
| **Transactions** | Session-based (complex) | Standard (simple) |
| **CDC** | Oplog polling (pull) | WAL streaming (push) |
| **Schema** | Flexible documents | Rigid schema + JSONB for flexibility |
| **Queries** | Aggregation pipeline | SQL |
| **Atomicity** | Within same connection | Standard ACID |
| **Migration effort** | None (current state) | 6-8 weeks |
| **Operational load** | MongoDB ops knowledge | PostgreSQL ops knowledge |

**What might you have missed:**

1. **Dual-write during transition** - Must support both
2. **Debezium vs polling** - CDC becomes different
3. **JSONB for flexibility** - Don't lose flexibility
4. **SQL rewrites** - All queries need updating
5. **Gradual cutover** - Can't just switch overnight
6. **Transactions become simpler** - PostgreSQL ACID better

---

## Scenario 3.2: Introduce a Message Queue (Kafka)

**Requirement:**
Currently, registrations are processed synchronously. If email service is down, registration fails.

Decouple using Kafka:
- Registration → Kafka topic → Email worker consumes
- Registration succeeds even if email fails
- Email retried until success
- Other services can consume same event

---

### YOUR TURN

**1. What events go into Kafka?**
- Just emails?
- All side effects?
- What if you have 1000s of subscribers later?

**2. Event schema:**
- What fields in the message?
- How to version if schema changes?
- Backwards compatibility?

**3. Ordering guarantee:**
- Does order matter?
- If guest registers twice, process in order?
- Or independent?

**4. Failure handling:**
- Worker crashes after consuming but before processing?
- Duplicate messages?
- Poison pills (messages that always fail)?

**5. Monitoring:**
- How do you detect lag?
- Alert if events pile up?
- Performance impact of Kafka?

**6. Rollback:**
- How do you migrate from current sync to Kafka?
- Can you test in production?

---

### SOLUTION REVEALED

**Ideal Approach:**

**1. Events for Kafka:**

Start small:
```
Topic: registration.events

Events:
├─ RegistrationCreated
├─ RegistrationApproved
├─ RegistrationCancelled
├─ RegistrationRefundProcessed
└─ RegistrationVerified (if using email verification)
```

Don't put everything - just the important state changes.

```typescript
// When registration created
await kafka.send({
  topic: 'registration.events',
  messages: [{
    key: registration._id.toString(),  // Group by registration
    value: JSON.stringify({
      type: 'RegistrationCreated',
      registrationId: registration._id,
      eventId: registration.eventId,
      userId: registration.userId,
      seatsRequested: registration.seats,
      status: registration.status,
      timestamp: new Date(),
      version: 1
    })
  }]
});
```

**Why just state changes?**
- Consumers only care about "what happened", not every intermediate step
- Reduces topic complexity

**2. Event schema & versioning:**

```typescript
// Versioned schema
{
  type: 'RegistrationCreated',
  version: 1,
  timestamp: '2024-08-14T12:34:56Z',
  data: {
    registrationId: UUID,
    eventId: UUID,
    userId: UUID,
    seatsRequested: number,
    status: string
  }
}

// Future version
{
  type: 'RegistrationCreated',
  version: 2,  // Added preferenceType
  timestamp: '2024-09-01T...',
  data: {
    registrationId: UUID,
    eventId: UUID,
    userId: UUID,
    seatsRequested: number,
    status: string,
    preferenceType: string  // NEW
  }
}

// Consumer handles both versions
const handleRegistrationCreated = (message) => {
  if (message.version === 1) {
    // Old handling
  } else if (message.version === 2) {
    // New handling with preferences
  }
};
```

**3. Ordering guarantee:**

```typescript
// Use registration ID as key (partitioning)
await kafka.send({
  topic: 'registration.events',
  messages: [{
    key: registration._id,  // Same registration → same partition
    value: JSON.stringify(event)
  }]
});

// Kafka guarantees:
// - Same partition = ordered
// - So all events for registration X are in order
// - But registration X and Y can be out of order (OK)
```

**Why this works:**
- Registration X: Create → Approve → Cancel (must be in order)
- But registration X and Y can happen concurrently
- Partition per registration ensures single registration order

**4. Failure handling:**

```typescript
// Email worker consuming
const emailWorker = kafka.consumer({groupId: 'email-workers'});

await emailWorker.run({
  eachMessage: async ({topic, partition, message}) => {
    const event = JSON.parse(message.value);
    
    try {
      // Send email
      const result = await emailService.send(event.data);
      
      // If we got here, success
      // Kafka auto-commits offset
    } catch (error) {
      // Decide: retry or dead-letter?
      
      if (isRetryable(error)) {
        // Throw to redeliver
        throw error;  // Kafka will retry this message
      } else {
        // Non-retryable (invalid email, etc)
        // Send to dead-letter queue
        await kafka.send({
          topic: 'email.dead-letters',
          messages: [{
            key: message.key,
            value: JSON.stringify({
              original: event,
              error: error.message,
              failedAt: new Date()
            })
          }]
        });
        
        // Don't throw - allow offset to advance
      }
    }
  }
});
```

**Duplicate handling:**
```typescript
// If worker crashes after sending email but before commit:
// - Email sent twice
// Solution: Idempotency key

// Email table
CREATE TABLE emails_sent (
  email_id UUID PRIMARY KEY,  // Unique per event
  event_id UUID,
  sent_at TIMESTAMP,
  UNIQUE(event_id)
);

// When sending, check first
const sendEmail = async (event) => {
  const exists = await checkEmailSent(event.registrationId);
  if (exists) {
    console.log('Email already sent, skipping');
    return;
  }
  
  // Send email
  await emailService.send(event.data);
  
  // Record sent
  await recordEmailSent(event.registrationId);
};
```

**Poison pill handling:**
```typescript
// Message that always fails (bad email format, etc)
const handlePoisonPill = async (message) => {
  try {
    // This will fail
    await process(message);
  } catch (error) {
    // After 10 retries, move to dead-letter
    if (message.retryCount > 10) {
      await deadLetterQueue.send(message);
    }
    throw error;
  }
};
```

**5. Monitoring:**

```typescript
// Track lag
const checkKafkaLag = async () => {
  const admin = kafka.admin();
  
  const offsets = await admin.fetchOffsets({
    groupId: 'email-workers',
    topics: ['registration.events']
  });
  
  const topicOffsets = await admin.fetchTopicMetadata({
    topics: ['registration.events']
  });
  
  offsets.forEach(offset => {
    const partition = offset.partition;
    const consumerOffset = offset.offset;
    const topicOffset = topicOffsets[partition].high;
    
    const lag = topicOffset - consumerOffset;
    
    if (lag > 1000) {
      alert(`Email worker lag: ${lag} messages behind`);
    }
  });
};

// Monitor in Prometheus
const lagGauge = new Gauge({
  name: 'kafka_consumer_lag',
  help: 'Kafka consumer lag',
  labelNames: ['topic', 'group', 'partition']
});

// Alert if lag growing
const lagAnomalyDetector = () => {
  const lag = getConsumerLag('email-workers');
  const lagTrend = calculateTrend(lag);  // Growing?
  
  if (lagTrend > 50) {  // Growing by 50 messages/min
    alert('Email processing slower than intake - may have issues');
  }
};
```

**Performance:**
- Kafka adds latency (messages not instant)
- But: Email worker async, guest sees confirmation immediately
- Tradeoff: ~100-500ms delay for emails acceptable

**6. Migration strategy (gradual):**

```
Phase 1: Parallel processing
├─ Registration saves to DB
├─ Sends to Kafka
├─ Old: Calls email service directly
├─ New: Email worker consumes Kafka
└─ Both running (double emails until confirmed working)

Phase 2: Verify Kafka worker
├─ Compare emails sent via direct vs Kafka
├─ Check for duplicates, losses
└─ Run parallel for 1 week

Phase 3: Switch
├─ Stop direct email calls
├─ Remove direct email code
└─ Kafka worker now primary

Phase 4: Decommission
├─ Remove old email service calls
└─ Archive Kafka setup (keep for history)
```

**Testing in production:**
```typescript
// Canary approach
const sendEmail = async (event) => {
  // Use feature flag
  if (shouldUseKafka(event)) {
    await kafka.produce(event);
  } else {
    await emailService.send(event);
  }
};

// Gradually increase percentage using Kafka
// 1% → 10% → 50% → 100%
```

---

**Comparison to Existing Architecture:**

| Aspect | Before (Sync) | After (Kafka) |
|--------|---------------|--------------|
| **Registration latency** | Includes email (500ms+) | Just DB (50ms) |
| **Email failure impact** | Registration fails | Email retried async |
| **Email retry** | 3 attempts in request | Built-in Kafka retry |
| **Scalability** | Email blocks API | Independent scaling |
| **Monitoring** | Email in request logs | Separate consumer lag tracking |
| **Operational complexity** | Simple | Moderate (need Kafka) |

**What might you have missed:**

1. **Partitioning by registration ID** - Ensures ordering
2. **Dead-letter queue for failures** - Don't lose failed messages
3. **Idempotency** - Prevent duplicate emails
4. **Schema versioning** - Handle future changes
5. **Gradual rollout with feature flag** - Don't flip switch
6. **Lag monitoring** - Critical operational metric

---

# LEVEL 4: SCALE

Handling 10x, 100x, or extreme traffic without architectural changes.

---

## Scenario 4.1: 10x Registration Traffic

**Requirement:**
Registration traffic increases from 10 req/sec to 100 req/sec. Current system starts timing out.

Assumption: No code changes allowed, only infrastructure/configuration.

---

### YOUR TURN

**1. Where does the bottleneck appear first?**
- API CPU?
- MongoDB lock contention?
- Database connections?
- Disk I/O?

**2. How would you measure which is bottleneck?**
- Monitoring metrics?
- What to look for?

**3. Scaling strategies (in order):**
- Add more API instances?
- Increase MongoDB resources?
- Add caching?
- Other?

**4. How many instances do you need?**
- 100 req/sec ÷ capacity per instance = ?
- Account for latency increase with load

**5. Monitoring during scale:**
- What SLAs must hold?
- Alert thresholds?

**6. Rollback plan:**
- How quickly can you scale down?
- Any data consistency risks?

---

### SOLUTION REVEALED

**Ideal Approach:**

**1. Bottleneck identification (probable order):**

```
At 10x traffic (100 req/sec):

T=0-5min:
  Likely bottleneck: API instance CPU (grows linearly)
  Symptom: Requests queued on API, response time > 100ms

T=5-15min:
  As API load spreads across instances:
  Next bottleneck: MongoDB lock on single event
  Symptom: Requests pile up in lock queue, waiting 1-2 seconds

T=15-30min:
  As some events fill:
  Next bottleneck: Database connection pool exhausted
  Symptom: "Too many connections" errors in logs

T=30+min:
  If persists:
  Bottleneck: MongoDB disk I/O (writing events + oplog)
  Symptom: Fsync taking 10s+, txn latency skyrockets
```

**2. Measuring bottleneck:**

```typescript
// Prometheus metrics to track
const metrics = {
  // API level
  httpRequestDuration,     // Should be ~50ms at baseline
  requestsQueued,          // Pending requests
  
  // MongoDB level
  mongoConnectionPoolUsage, // % of pool used
  mongoTransactionDuration, // Should be ~10ms
  mongoLockWaitTime,       // Time waiting for locks
  mongoOplogLag,           // CDC catching up?
  
  // System level
  cpuUsage,               // % CPU on each instance
  diskIOLatency,          // Disk write time
  networkBandwidth,       // Network saturation
};

// Alert if any grow > 2x normal
if (httpRequestDuration > 100ms) {
  alert('Slow registrations - likely bottleneck');
}
```

**3. Scaling strategies (in order of effectiveness):**

**Strategy 1: Horizontal scale API** (easiest, helps first bottleneck)
```
Current: 1 API instance × 10 req/sec = 10 req/sec
After: 5 API instances × 20 req/sec each = 100 req/sec

Deployment:
├─ Start 4 new instances
├─ Add to load balancer
├─ Forward traffic gradually (canary)
└─ Monitor error rate

Cost: 4 more servers = 4x operational cost
Helps: API CPU bottleneck (solved)
Doesn't help: MongoDB lock contention (still there!)
```

**Strategy 2: Increase MongoDB resources** (helps 2nd bottleneck)
```
Current: 1 MongoDB instance (or replica set)
After: Add read replicas + replica set upgrade

Changes:
├─ Upgrade disk to faster SSD (if not already)
├─ Increase RAM (cache more)
├─ Add read replicas (spread analytics queries)
└─ Tune: Increase maxPoolSize if needed

Cost: +50% for better hardware
Helps: Lock contention (slightly - more CPU/RAM), disk I/O
Still doesn't solve: Lock serialization on single event
```

**Strategy 3: Connection pool tuning** (helps 3rd bottleneck)
```
// In MongoDB connection options
mongoClient.connect({
  maxPoolSize: 150,  // Default 100, increase for 10x traffic
  minPoolSize: 50    // Keep connections warm
});

// Impact:
├─ More concurrent connections available
├─ Reduces "connection timeout" errors
├─ Uses more memory (acceptable)
```

**Strategy 4: Caching** (indirect help)
```
// Add Redis L1 cache for event capacity
const getEventCapacity = async (eventId) => {
  // Check cache first
  let capacity = await redis.get(`event:${eventId}:capacity`);
  if (capacity) return capacity;
  
  // Cache miss, query DB
  const event = await db.event.findById(eventId);
  capacity = event.capacity - event.registeredCount;
  
  // Cache for 5 seconds
  await redis.set(`event:${eventId}:capacity`, capacity, 'EX', 5);
  return capacity;
};

// Doesn't solve: Lock contention (still write single event)
// But: Reduces capacity check queries, frees DB resources
```

**4. Capacity calculation:**

```
Current state:
├─ 1 instance handling 10 req/sec
├─ Response time: 50ms per request
├─ Concurrent: (10 req/sec) × (50ms) = 0.5 concurrent requests

At 100 req/sec (target):
├─ If stays 50ms latency: Need (100 × 0.05) = 5 concurrent slots
├─ But latency increases under load: 50ms → 100ms
├─ With 100ms latency: Need (100 × 0.10) = 10 concurrent slots

Each instance can handle ~20 req/sec:
├─ 100 req/sec ÷ 20 per instance = 5 instances needed

Reality: Might need 6-7 instances with safety margin
```

**5. Monitoring during scale:**

```
Key metrics to watch:
├─ p50 latency: Should stay < 100ms
├─ p99 latency: Should stay < 500ms
├─ Error rate: Should stay < 0.1%
├─ Capacity utilization: Should not exceed 85%
├─ MongoDB lock wait time: Should stay < 500ms

Alert thresholds:
├─ p99 > 1 second: Scale up now
├─ p99 > 2 seconds: Page on-call engineer
├─ Error rate > 1%: Scale down + investigate
```

**6. Rollback plan:**

```
If something breaks:
├─ Traffic is easily reversible
├─ Remove API instances from load balancer
├─ Traffic re-routes to remaining instances
├─ Takes ~5 seconds with health checks

Data consistency risks:
├─ None: Registrations already committed to DB
├─ Scaling down doesn't lose data
├─ Safe to roll back

Gradual approach (preferred):
├─ Start with 1-2 instances
├─ Monitor for 1 hour
├─ Add 1 instance every 10 minutes
├─ Pause if issues arise
└─ Slower but safer
```

---

**Comparison to Existing Architecture:**

| Metric | 10 req/sec | 100 req/sec (after scaling) |
|--------|-----------|-----|
| **API instances** | 1 | 5-7 |
| **MongoDB** | 1 instance | Same + optimized |
| **Response time** | 50ms | 100-150ms |
| **Concurrent reqs** | 0.5 | 10-15 |
| **Lock contention** | Low | High (but parallel across events) |
| **Operational cost** | Baseline | 5-7x |

**What might you have missed:**

1. **Lock contention on single event** - Scaling API doesn't solve this
2. **Connection pool limits** - Must increase for 10x connections
3. **Caching helps indirectly** - Reduces DB queries, not transactions
4. **Gradual scaling** - Don't flip switch, increase slowly
5. **Monitoring is critical** - Can't optimize what you can't measure
6. **Rollback easy** - No data loss, just traffic re-routing

---

## Scenario 4.2: 100x Traffic + Millions of Registrations

**Requirement:**
Traffic is now 1000 req/sec. Database now has 10M registrations. Dashboard is slow.

Current atomic reservation design breaks under this load. Must redesign without breaking functionality.

---

### YOUR TURN

**1. What breaks at this scale?**
- Is it the lock?
- Is it the capacity query?
- Is it network latency?
- Multiple bottlenecks?

**2. How would you redesign capacity checking?**
- Can't query 10M rows each registration
- Pre-compute and cache?
- Event streaming?

**3. How does CDC handle 1000 reg/sec?**
- Is it keeping up?
- Dashboard stale?

**4. What about database sharding?**
- Shard registrations across servers?
- By eventId? By userId? By time?

**5. How do you handle uneven load?**
- Popular events have bottleneck
- Unpopular events idle
- How to balance?

**6. What's acceptable to sacrifice at this scale?**
- Real-time consistency?
- Exact capacity (± 5%)?
- What can bend?

---

### SOLUTION REVEALED

**Ideal Approach:**

**1. Bottlenecks at 100x (1000 req/sec) + 10M registrations:**

```
Bottleneck 1: Atomic lock (PRIMARY KILLER)
├─ Each event serialized through single lock
├─ At 1000 req/sec across 100 events = 10 req/sec per event
├─ Lock wait time becomes dominant
└─ Solution: Pre-assign seats (sharding capacity)

Bottleneck 2: Capacity query latency
├─ Dashboard queries 10M registrations
├─ Even with index, aggregation pipeline is slow
├─ CDC projection helps, but at 1000 reg/sec, lag grows
└─ Solution: Real-time capacity from stream processor

Bottleneck 3: Database disk I/O
├─ 1000 writes/sec × 1KB = 1MB/sec
├─ MongoDB oplog + data = 2x writes
├─ Disk can't keep up
└─ Solution: SSD + write batching

Bottleneck 4: CDC lag (related to #3)
├─ CDC worker falls behind
├─ Analytics always stale
├─ Dashboard shows wrong numbers
└─ Solution: Stream processor (Kafka) instead of polling
```

**2. Redesign capacity checking (pre-assign approach):**

Instead of:
```
Registration → Check capacity → Create if fits
```

Do:
```
Pre-allocate seats during event creation → 
Registration → Claim available seat →
No capacity check needed
```

**Implementation:**

```typescript
// At event creation time
const createEvent = async (eventData) => {
  const event = await Event.create({
    ...eventData,
    capacity: 1000,
    seatsAllocated: false  // Not yet allocated
  });
  
  // Queue background job to allocate seats
  await jobQueue.enqueue({
    type: 'ALLOCATE_SEATS',
    eventId: event._id,
    count: 1000,
    batchSize: 100  // Create 100 at a time
  });
  
  return event;
};

// Background worker allocates seats
const allocateSeats = async (eventId, count, batchSize) => {
  for (let i = 0; i < count; i += batchSize) {
    const seats = [];
    for (let j = 0; j < batchSize; j++) {
      seats.push({
        eventId,
        seatNumber: i + j,
        status: 'available',
        assignedUserId: null
      });
    }
    
    await Seat.insertMany(seats);
  }
};

// At registration time
const registerForEvent = async (eventId, userId, seatsRequested) => {
  // Lock only on event (still needed for count)
  const session = await mongo.startSession();
  session.startTransaction();
  
  try {
    // Try to claim a pre-allocated seat
    const availableSeats = await Seat.findOneAndUpdate(
      {eventId, status: 'available'},
      {status: 'claimed', assignedUserId: userId},
      {session, new: true}
    );
    
    if (!availableSeats) {
      throw new CapacityError('No seats available');
    }
    
    // Create registration (fast, no capacity check)
    const registration = await Registration.create({
      eventId, userId, seatsRequested,
      status: 'confirmed',
      seatId: availableSeats._id
    }, {session});
    
    await session.commitTransaction();
    return registration;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  }
};
```

**Benefits:**
- Capacity check is single index lookup (fast)
- No aggregation needed
- Lock only on seat assignment (brief)
- Throughput: 1000+ reg/sec per event

**Tradeoff:**
- More storage (10M seats vs querying registrations)
- Must pre-allocate (can't add capacity dynamically)

**3. CDC redesign for real-time analytics:**

**Old (polling, 5s lag):**
```
MongoDB oplog → CDC worker polls every 5s → Analytics DB
```

**New (streaming, real-time):**
```
Registration created
  ↓
Kafka topic: registrations
  ↓
Stream processor (Kafka Streams) → Calculates capacity in real-time
  ↓
Updates Redis (capacity store)
  ↓
Dashboard reads from Redis (< 1ms)
```

**Implementation:**

```typescript
// When registration confirmed, publish to Kafka
await kafka.send({
  topic: 'registrations',
  messages: [{
    key: registration.eventId,  // Partition by event
    value: JSON.stringify({
      type: 'RegistrationConfirmed',
      eventId: registration.eventId,
      seats: registration.seatsRequested,
      timestamp: new Date()
    })
  }]
});

// Kafka Streams topology
const topology = {
  source: 'registrations',
  stream: {
    map: msg => ({
      eventId: msg.key,
      seats: msg.value.seats
    }),
    
    // Aggregate by event
    aggregate: {
      initializer: () => ({confirmedCount: 0}),
      adder: (agg, msg) => ({
        confirmedCount: agg.confirmedCount + msg.seats
      }),
      window: TimeWindowedKStream({
        type: 'session',
        gap: 60000  // 60 second windows
      })
    },
    
    // Store in Redis
    toSink: 'redis'
  }
};

// Redis receives updates
// Dashboard queries Redis (instant)
const getCapacity = async (eventId) => {
  const count = await redis.get(`event:${eventId}:confirmed`);
  const capacity = 1000;
  return capacity - count;
};
```

**4. Database sharding (if needed):**

Sharding by event:
```
Events 1-100 → Shard 0
Events 101-200 → Shard 1
Events 201-300 → Shard 2
Events 301-400 → Shard 3

Registration queries:
- Get event, know which shard
- Query only that shard
```

**Sharding by time:**
```
Registrations Jan 2024 → DB 1
Registrations Feb 2024 → DB 2
Registrations Mar 2024 → DB 3

Queries become faster (smaller datasets)
But complex for "capacity this month"
```

**Recommendation:** Shard by event (easier, matches query pattern).

But at 1000 req/sec, sharding might not be needed if:
- Using seat allocation (faster)
- Using Redis cache (faster queries)
- Database optimized (SSD, good hardware)

**5. Handling uneven load (popular events):**

**Problem:**
- Popular event: 100 registrations/sec
- Unpopular event: 0.1 registrations/sec
- Lock still bottleneck for popular event

**Solutions:**

Option A: **Sub-sharding**
```
Event 1 has 100 shards (virtual seats):
├─ Hash(userId) % 100 → determines which shard
├─ Each shard has its own lock
└─ 100 registrations can happen in parallel

Registration:
├─ Route to sub-shard: userId % 100
├─ Lock only that sub-shard
├─ No conflict with other registrations
```

Option B: **Optimistic locking**
```
Seat.update(
  {_id: seatId, version: currentVersion},
  {status: 'claimed', version: currentVersion + 1}
);

If version mismatch → Retry different seat
At high contention → More retries, but no lock blocking
```

Option C: **Pre-reserve percentage**
```
Event has 1000 capacity.
Allocate:
├─ 70% to regular queue (700 seats)
├─ 20% to waitlist (200 seats)
└─ 10% reserved for VIP (100 seats)

Distribute registrations:
├─ 70% go to main (low contention)
├─ 20% go to waitlist (separate queue)
└─ 10% to VIP (separate)

Reduces peak contention on main queue
```

**6. What's acceptable to sacrifice:**

At 1000 req/sec, you might accept:

```
❌ Exact real-time capacity
✓ Capacity within 1-5 seconds

❌ Strong consistency (always exact numbers)
✓ Eventual consistency (accurate within window)

❌ Synchronous refunds
✓ Async refund processing (queue)

✓ Pre-allocated seats (schema difference)
✓ Stream processing instead of oplog polling
✓ Redis cache instead of direct queries
```

---

**Comparison to Existing Architecture:**

| Aspect | Current | 100x Scale |
|--------|---------|-----------|
| **Registration model** | Check capacity dynamically | Pre-allocated seats |
| **Capacity query** | Aggregation pipeline | Redis lookup |
| **CDC** | Oplog polling (5s) | Kafka Streams (real-time) |
| **Lock bottleneck** | Single event lock | Sub-sharded or optimistic |
| **Database** | Single instance | Sharded or very high-spec |
| **Consistency** | Strong (exact capacity) | Eventual (within 5s) |

**What might you have missed:**

1. **Pre-allocation changes schema** - Seats table instead of dynamic checking
2. **Stream processor needed** - Kafka Streams for real-time analytics
3. **Sub-sharding for popular events** - Distributes load across lock-free slots
4. **Accept eventual consistency** - Real-time numbers impossible at this scale
5. **Redis becomes primary** - Not just cache, primary capacity store
6. **Multiple architectural changes needed** - Can't just "add more servers"

---

# LEVEL 5: FAILURE MODES

Handling failures, data inconsistencies, and recovery scenarios.

---

## Scenario 5.1: Duplicate Message Processing

**Requirement:**
Kafka delivers a message twice (network hiccup, consumer crash, broker rebalance). The email worker processes same registration email twice.

Guest gets two confirmation emails. Host sees registration counted twice.

How do you prevent and recover?

---

### YOUR TURN

**1. Where should deduplication happen?**
- Consumer level?
- Service level?
- Database level?

**2. Idempotency key design:**
- What makes message unique?
- Where is key stored?
- How long to keep?

**3. What if deduplication fails?**
- Message lands twice despite precautions?
- Detection mechanism?

**4. Recovery from duplicates:**
- How do you find them?
- How do you merge them?
- Rollback logic?

**5. Testing duplicates:**
- Simulated duplicate?
- Chaos engineering?

**6. Alerting:**
- How do you detect in production?
- Alert threshold?

---

### SOLUTION REVEALED

**Ideal Approach:**

**1. Deduplication at database level (most reliable):**

```typescript
// Email processing (consumer)
const processRegistrationEmail = async (message) => {
  const event = JSON.parse(message.value);
  
  // Check if already processed
  const existing = await EmailRecord.findOne({
    messageId: event.messageId
  });
  
  if (existing) {
    console.log('Email already sent, skipping');
    return;  // Idempotent - safe to skip
  }
  
  // Send email
  try {
    const result = await emailService.send({
      to: event.guestEmail,
      subject: `Registration Confirmation - ${event.eventName}`,
      body: `You registered for ${event.eventName}`
    });
    
    // Record that we sent it
    await EmailRecord.create({
      messageId: event.messageId,
      registrationId: event.registrationId,
      email: event.guestEmail,
      sentAt: new Date(),
      emailServiceId: result.messageId
    });
    
  } catch (error) {
    console.error('Failed to send email:', error);
    throw error;  // Retry
  }
};
```

**Why database level?**
- Consumer might crash after sending email but before marking done
- Database is source of truth
- Other services can check: "Was this already processed?"

**2. Idempotency key design:**

```typescript
// Message from API
{
  messageId: "msg_12345",  // UUID, should be deterministic
  registrationId: "reg_789",
  guestEmail: "user@example.com",
  eventName: "Conference 2024",
  timestamp: "2024-08-14T12:34:56Z",
  version: 1
}

// messageId = sha256(registrationId + type)
// Ensures same registration → same message ID
const generateMessageId = (registrationId, messageType) => {
  return sha256(`${registrationId}:${messageType}`);
};

// Keep records for 30 days
// After that, OK to re-send (user unlikely to complain)
const purgeOldEmailRecords = async () => {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  await EmailRecord.deleteMany({sentAt: {$lt: thirtyDaysAgo}});
};
```

**3. If deduplication fails:**

```typescript
// Scenario: Two emails sent despite safeguards

// Detection 1: User reports duplicate email
// Detection 2: Monitoring alert
const detectDuplicateEmails = async () => {
  const grouped = await EmailRecord.aggregate([
    {$group: {_id: '$messageId', count: {$sum: 1}}},
    {$match: {count: {$gt: 1}}}
  ]);
  
  if (grouped.length > 0) {
    alert(`Found ${grouped.length} duplicate message IDs`);
  }
};

// Manual inspection
// Check why duplicate got through
// - Was messageId collision?
// - Database transaction issue?
// - Timing issue?
```

**4. Recovery from duplicates:**

```typescript
// If two emails sent, can't un-send
// But can prevent registration being double-counted

// Root cause: Registration appears twice
const findDuplicateRegistrations = async () => {
  const duplicates = await Registration.aggregate([
    {$group: {
      _id: {eventId: '$eventId', userId: '$userId'},
      count: {$sum: 1},
      ids: {$push: '$_id'}
    }},
    {$match: {count: {$gt: 1}}}
  ]);
  
  return duplicates;
};

// Merge duplicates
const mergeDuplicateRegistrations = async (duplicateSet) => {
  const [keep, ...remove] = duplicateSet.ids
    .sort()  // Consistent ordering
    .reverse();  // Keep most recent
  
  // Keep one, delete others
  for (const removeId of remove) {
    const registration = await Registration.findById(removeId);
    
    if (registration.status !== 'confirmed') {
      await Registration.deleteOne({_id: removeId});
    } else {
      // Was confirmed, just mark as duplicate
      registration.isDuplicate = true;
      registration.duplicateOf = keep;
      await registration.save();
    }
  }
  
  // Update capacity if needed
  const keptReg = await Registration.findById(keep);
  const event = await Event.findById(keptReg.eventId);
  event.approvedCount -= (remove.length * keptReg.seats);
  await event.save();
};
```

**5. Testing duplicates:**

```typescript
// Unit test: Process same message twice
test('processing duplicate message is idempotent', async () => {
  const message = createRegistrationMessage('msg_123', 'reg_456');
  
  // Process once
  await emailWorker.processMessage(message);
  
  // Email sent
  const sent1 = await EmailRecord.findOne({messageId: 'msg_123'});
  expect(sent1).toBeDefined();
  
  // Process again (duplicate)
  await emailWorker.processMessage(message);
  
  // Same email record, not created twice
  const records = await EmailRecord.find({messageId: 'msg_123'});
  expect(records.length).toBe(1);
});

// Integration test: Kafka broker rebalance
test('kafka broker rebalance does not cause duplicate processing', async () => {
  const consumer = new KafkaConsumer();
  
  // Process message
  const message1 = createMessage('msg_123');
  await consumer.consume(message1);
  
  // Simulate broker crash (no offset commit yet)
  await consumer.crash();
  
  // Consumer rejoins (gets same message again)
  const consumer2 = new KafkaConsumer();
  await consumer2.consume(message1);
  
  // Should be idempotent
  const emailRecords = await EmailRecord.find({messageId: 'msg_123'});
  expect(emailRecords.length).toBe(1);
});

// Chaos test: Send message 100x concurrently
test('handles concurrent duplicate processing', async () => {
  const message = createMessage('msg_123');
  
  // 100 workers all process same message concurrently
  const promises = [];
  for (let i = 0; i < 100; i++) {
    promises.push(processMessage(message));
  }
  
  await Promise.all(promises);
  
  // Only one email sent
  const records = await EmailRecord.find({messageId: 'msg_123'});
  expect(records.length).toBe(1);
});
```

**6. Production alerting:**

```typescript
// Prometheus metric: duplicates detected
const duplicateGauge = new Gauge({
  name: 'kafka_duplicate_messages',
  help: 'Number of duplicate messages detected',
  labelNames: ['topic', 'consumer_group']
});

// Background job (hourly)
const detectDuplicates = async () => {
  const duplicates = await EmailRecord.aggregate([
    {$group: {_id: '$messageId', count: {$sum: 1}}},
    {$match: {count: {$gt: 1}}}
  ]);
  
  duplicateGauge.set(duplicates.length);
  
  if (duplicates.length > 10) {
    // Alert if more than 10 duplicates detected
    alert({
      severity: 'warning',
      message: `Found ${duplicates.length} duplicate message IDs in last hour`,
      context: duplicates
    });
  }
};
```

---

**Comparison to Existing Architecture:**

| Aspect | Without Dedup | With Dedup |
|--------|---------------|-----------|
| **Duplicate emails** | Possible (Kafka rebalance) | Prevented (idempotency key) |
| **Duplicate registrations** | Possible | Detected + merged |
| **Database size** | Smaller | Slightly larger (email records) |
| **Recovery time** | Manual intervention | Automated detection |

**What might you have missed:**

1. **Idempotency key at database** - Most reliable
2. **Message ID deterministic** - Same registration → same ID
3. **EmailRecord table** - Track what's been sent
4. **Purge old records** - Can't keep forever
5. **Duplicate detection job** - Proactive monitoring
6. **Merge duplicates** - If they slip through

---

## Scenario 5.2: Partial Failure (Network Partition)

**Requirement:**
Database server partitions from API server (network loss). API can't reach MongoDB.

Guests try to register. What happens? How do you handle it?

---

### YOUR TURN

**1. Should registration fail or succeed?**
- Fail fast (immediate error)?
- Queue and retry?
- Accept anyway?

**2. What if client doesn't get response?**
- Client retries?
- Registration created on retry?

**3. How do you detect partition?**
- What signal indicates "database down"?
- False positives (slow DB, not dead)?

**4. Circuit breaker strategy:**
- When to open?
- When to half-open?
- When to close?

**5. Recovery:**
- When partition heals, how do you catch up?
- Any data loss?

**6. Testing:**
- Can you reproduce this?
- How do you verify fix?

---

### SOLUTION REVEALED

**Ideal Approach:**

**1. Registration during partition: Fail fast**

```typescript
// API endpoint with circuit breaker
const handleRegistration = async (req, res) => {
  try {
    // Check circuit breaker first
    if (!circuitBreaker.canExecute()) {
      return res.status(503).json({
        error: 'Service temporarily unavailable',
        message: 'Database connection issues, please retry in 30 seconds'
      });
    }
    
    // Try registration
    const registration = await circuitBreaker.execute(async () => {
      return await atomicReservation(
        req.body.eventId,
        req.user.id,
        req.body.seats
      );
    });
    
    res.json({status: 'confirmed', registration});
    
  } catch (error) {
    if (error instanceof CircuitBreakerOpenError) {
      res.status(503).json({error: 'Service unavailable'});
    } else if (error instanceof DatabaseTimeoutError) {
      res.status(504).json({error: 'Database timeout'});
    } else {
      res.status(400).json({error: error.message});
    }
  }
};
```

**Why fail fast?**
- Better than hanging (guest gets response)
- Better than queuing (no duplicate processing)
- Guest can retry or try later

**2. Client retry logic:**

```typescript
// Frontend
const registerWithRetry = async (eventId, seats, maxRetries = 3) => {
  let lastError;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch('/api/registrations', {
        method: 'POST',
        body: JSON.stringify({eventId, seats})
      });
      
      if (response.status === 503 || response.status === 504) {
        // Service unavailable, backoff and retry
        const backoff = Math.pow(2, attempt) * 1000;  // 1s, 2s, 4s
        await sleep(backoff);
        lastError = new Error('Service unavailable');
        continue;
      }
      
      if (!response.ok) {
        throw new Error(response.statusText);
      }
      
      return await response.json();
      
    } catch (error) {
      lastError = error;
    }
  }
  
  throw new Error(`Registration failed after ${maxRetries} retries: ${lastError}`);
};

// Idempotency key ensures retries are safe
const idempotencyKey = generateId();

// Same request with same key → same result
const response = await registerWithRetry(eventId, seats);
// Even if we retry, same idempotencyKey ensures no double registration
```

**3. Detecting partition:**

```typescript
// Circuit breaker tracks failures
class CircuitBreaker {
  constructor(failureThreshold = 5, resetTimeout = 30000) {
    this.failureCount = 0;
    this.failureThreshold = failureThreshold;
    this.resetTimeout = resetTimeout;
    this.state = 'CLOSED';  // Normal
    this.nextResetTime = null;
  }
  
  canExecute() {
    if (this.state === 'OPEN') {
      // Check if enough time passed to try again
      if (Date.now() > this.nextResetTime) {
        this.state = 'HALF_OPEN';
        return true;
      }
      return false;
    }
    return true;
  }
  
  async execute(fn) {
    try {
      const result = await Promise.race([
        fn(),
        timeout(5000)  // 5 second timeout
      ]);
      
      // Success
      this.onSuccess();
      return result;
      
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  onFailure() {
    this.failureCount++;
    
    if (this.failureCount >= this.failureThreshold) {
      console.warn(`Circuit breaker OPEN (${this.failureCount} failures)`);
      this.state = 'OPEN';
      this.nextResetTime = Date.now() + this.resetTimeout;
    }
  }
  
  onSuccess() {
    if (this.state === 'HALF_OPEN') {
      // Recovery successful
      console.log('Circuit breaker CLOSED (recovered)');
      this.state = 'CLOSED';
      this.failureCount = 0;
    }
  }
}
```

**States:**

```
CLOSED (normal):
  ├─ Requests go through
  ├─ Failures tracked
  └─ On 5 failures → OPEN

OPEN (circuit broken):
  ├─ Requests immediately fail (fast)
  ├─ No attempt to reach database
  ├─ After 30s → HALF_OPEN

HALF_OPEN (testing recovery):
  ├─ Allow 1 request through
  ├─ If success → CLOSED
  ├─ If fails → OPEN (reset timer)
```

**4. Circuit breaker strategy:**

```typescript
const circuitBreaker = new CircuitBreaker({
  failureThreshold: 5,     // Open after 5 failures
  resetTimeout: 30000,     // Try recovery after 30s
  timeout: 5000,           // Individual request timeout
  halfOpenRequests: 1      // Test 1 request in HALF_OPEN
});

// Metrics
const cbMetrics = {
  stateChanges: [],  // Track state changes
  failureHistory: [] // Track failures
};

// Monitoring
setInterval(() => {
  const metrics = getCircuitBreakerMetrics();
  
  if (metrics.state === 'OPEN') {
    alert(`Circuit breaker OPEN - Database likely unreachable`);
  }
  
  if (metrics.stateChangeCount > 5) {
    alert(`Circuit breaker flapping - check network stability`);
  }
}, 10000);
```

**5. Recovery when partition heals:**

```typescript
// When database becomes reachable again
// Circuit breaker auto-recovers via HALF_OPEN state

// But check for data inconsistency
const recoveryCheck = async () => {
  // After partition heals, verify:
  
  // 1. Count registrations
  const dbCount = await db.registrations.countDocuments();
  const expectedCount = await getExpectedCount();
  
  if (dbCount < expectedCount) {
    console.warn(`Registrations lost during partition: ${expectedCount - dbCount}`);
    // Might need manual recovery
  }
  
  // 2. Check oplog for gaps
  const gaps = await checkOploGaps();
  if (gaps.length > 0) {
    console.warn('CDC oplog had gaps, analytics may be stale');
    // Trigger CDC resync
  }
  
  // 3. Verify capacity counters
  const events = await db.events.find();
  for (const event of events) {
    const actual = await db.registrations.countDocuments({
      eventId: event._id,
      status: 'confirmed'
    });
    
    if (actual !== event.approvedCount) {
      console.error(`Capacity mismatch for event ${event._id}: expected ${event.approvedCount}, got ${actual}`);
      // Fix capacity counter
      event.approvedCount = actual;
      await event.save();
    }
  }
};
```

**6. Testing network partition:**

```typescript
// Unit test: Mock database timeout
test('circuit breaker opens on repeated timeouts', async () => {
  const cb = new CircuitBreaker({failureThreshold: 3});
  const db = mockDatabase({timeout: true});
  
  // Fail 3 times
  for (let i = 0; i < 3; i++) {
    expect(async () => {
      await cb.execute(() => db.query());
    }).toThrow();
  }
  
  // Circuit now open
  expect(cb.state).toBe('OPEN');
  
  // New request fails immediately
  expect(async () => {
    await cb.execute(() => db.query());
  }).toThrow('Circuit breaker is open');
});

// Integration test: Chaos monkey
test('survives 30-second database outage', async () => {
  const server = startServer();
  const db = startMockDatabase();
  
  // Make registrations normally
  const registration1 = await register(eventId, userId, 2);
  expect(registration1.status).toBe('confirmed');
  
  // Simulate network partition
  await db.disconnect();
  
  // Try registration during outage
  const registration2 = await register(eventId, userId2, 3);
  expect(registration2.error).toBe('Service unavailable');
  
  // Wait for recovery
  await sleep(35000);
  await db.reconnect();
  
  // Should work again
  const registration3 = await register(eventId, userId3, 1);
  expect(registration3.status).toBe('confirmed');
});
```

---

**Comparison to Existing Architecture:**

| Aspect | Before | With Circuit Breaker |
|--------|--------|----------------------|
| **Network partition** | Hangs (guest waits forever) | Fails fast (guest sees 503) |
| **Recovery** | Manual restart | Automatic (HALF_OPEN retry) |
| **Data loss** | Possible (retries fail) | Not from circuit breaker |
| **Monitoring** | Silent failure | Alerts on state changes |

**What might you have missed:**

1. **Fail fast better than hanging** - Guest gets feedback
2. **Circuit breaker states** - CLOSED → OPEN → HALF_OPEN
3. **Idempotency key on client** - Allows safe retries
4. **Recovery check** - Detect data inconsistencies
5. **Oplog gaps** - CDC might miss changes
6. **Capacity counter verification** - May need repair

---

# LEVEL 6: ARCHITECTURAL REDESIGN

Large-scale architectural pivots requiring significant rework.

---

## Scenario 6.1: Convert to Event-Driven Architecture

**Requirement:**
Current system: Synchronous registration (user registers → immediate confirmation).

Target: Event-driven system where:
- Registration publishes event
- Multiple subscribers react independently
- Email service, analytics, billing all consume events
- System loosely coupled (service can fail without blocking registration)

How would you redesign without losing functionality?

---

### YOUR TURN

**1. What's the core event?**
- What single fact should be published?
- What information does every subscriber need?

**2. Event schema:**
- What fields must every event have?
- Versioning strategy?

**3. Subscriber examples:**
- Name the services that consume registration events
- What does each do?

**4. Ordering guarantee:**
- Does order matter?
- All events in order?
- Or per-registration order?

**5. Exactly-once semantics:**
- How do you guarantee no duplicates?
- No lost events?

**6. Monitoring:**
- How do you track end-to-end flow?
- Detect when subscriber is down?

---

### SOLUTION REVEALED

**Ideal Approach:**

**1. Core event: RegistrationConfirmed**

```typescript
// Single source of truth
interface RegistrationConfirmedEvent {
  // Identity
  eventId: UUID,
  registrationId: UUID,
  userId: UUID,
  timestamp: ISO8601,
  
  // What happened
  action: 'confirmed',
  version: 1,
  
  // Data needed by subscribers
  seatsRequested: number,
  amountPaid: decimal,
  guestEmail: string,
  guestName: string,
  eventName: string,
  eventStartDate: ISO8601,
  
  // Metadata
  source: 'api',  // or 'manual-approval'
  causedBy: 'auto-approval' | 'manual-approval'
}
```

**Why this event?**
- All subscribers care about: "A guest confirmed for event X"
- Everything else is derived from this fact
- Single source of truth

**2. Event schema & versioning:**

```typescript
// Versioned event envelope
interface EventEnvelope {
  eventId: UUID,
  eventType: 'RegistrationConfirmed' | 'RegistrationCancelled' | ...,
  version: 1,  // Schema version
  timestamp: ISO8601,
  correlationId: UUID,  // Trace across services
  causationId: UUID,    // What caused this event
  
  // Payload (version-specific)
  data: RegistrationConfirmedEventV1 | RegistrationConfirmedEventV2
}

// Migration scenario: Add preferenceType field
interface RegistrationConfirmedEventV1 {
  eventId: UUID,
  registrationId: UUID,
  userId: UUID,
  // ... other fields
  // NO preferenceType
}

interface RegistrationConfirmedEventV2 {
  eventId: UUID,
  registrationId: UUID,
  userId: UUID,
  preferenceType: string,  // NEW
  // ... other fields
}

// Consumers handle both
const handleEvent = (event: EventEnvelope) => {
  if (event.version === 1) {
    const data = event.data as RegistrationConfirmedEventV1;
    // Handle v1
  } else if (event.version === 2) {
    const data = event.data as RegistrationConfirmedEventV2;
    // Handle v2 (with preferences)
  }
};
```

**3. Subscribers (independent services):**

```
RegistrationConfirmed event
  ↓
┌─────────────────────────────────────────────┐
│                                             │
├─→ Email Service                            │
│   └─ Sends confirmation email              │
│   └─ Retries on failure                    │
│   └─ No impact on registration             │
│                                             │
├─→ Analytics Service                        │
│   └─ Updates registration count            │
│   └─ Pre-aggregates metrics                │
│   └─ Triggers alerts                       │
│                                             │
├─→ Billing Service                          │
│   └─ Records paid event                    │
│   └─ Triggers payment processing           │
│   └─ No payment = no registration (error)  │
│                                             │
├─→ Notification Service                     │
│   └─ Notifies host: "New registration"     │
│   └─ Updates waitlist if needed            │
│   └─ Optional (ok to drop)                 │
│                                             │
└─→ Audit Service                            │
    └─ Records action for compliance         │
    └─ Immutable log                         │
    └─ Can catch up if delayed               │

```

**Each subscriber:**
```typescript
// Email Service Consumer
const emailConsumer = kafka.consumer({groupId: 'email-service'});

await emailConsumer.subscribe({topic: 'registration-events'});

await emailConsumer.run({
  eachMessage: async ({message}) => {
    const event = JSON.parse(message.value);
    
    if (event.eventType === 'RegistrationConfirmed') {
      try {
        await emailService.sendConfirmation(event.data.guestEmail);
      } catch (error) {
        // Log but don't fail
        // Message will be retried (offset not committed)
        console.error('Email failed:', error);
        throw error;  // Trigger retry
      }
    }
  }
});

// Analytics Service Consumer
const analyticsConsumer = kafka.consumer({groupId: 'analytics-service'});

await analyticsConsumer.subscribe({topic: 'registration-events'});

await analyticsConsumer.run({
  eachMessage: async ({message}) => {
    const event = JSON.parse(message.value);
    
    if (event.eventType === 'RegistrationConfirmed') {
      // Update pre-aggregated counters
      await Analytics.updateOne(
        {eventId: event.data.eventId},
        {$inc: {confirmCount: 1, totalSeats: event.data.seatsRequested}}
      );
    } else if (event.eventType === 'RegistrationCancelled') {
      // Update counters on cancellation
      await Analytics.updateOne(
        {eventId: event.data.eventId},
        {$inc: {confirmCount: -1, totalSeats: -event.data.seatsRequested}}
      );
    }
  }
});
```

**4. Ordering guarantee:**

```typescript
// Kafka partitions by eventId (ensures ordering per event)
await kafka.send({
  topic: 'registration-events',
  messages: [{
    key: event.eventId,  // ← Partitions by event
    value: JSON.stringify(event)
  }]
});

// Guarantee:
// - All registrations for Event X are in order
// - Registration X and Y can be out of order (OK)
// - Email service gets them in same order as created

// Consumer offset tracking
// If email service crashes:
// - Offsets saved to Kafka
// - Restart processes from last saved offset
// - No duplicates (same messages not reprocessed)
// - No gaps (no messages skipped)
```

**5. Exactly-once semantics:**

```typescript
// Problem: Exactly-once is hard in distributed systems
// Solution: Use idempotency keys

// Email service
const sendEmail = async (event) => {
  const emailId = `${event.registrationId}:email`;
  
  // Check if already sent
  const sent = await EmailLog.findOne({emailId});
  if (sent) {
    return;  // Already sent, skip
  }
  
  // Send email
  await emailService.send(event.data);
  
  // Record that we sent it
  await EmailLog.create({emailId, sentAt: new Date()});
  
  // Commit offset AFTER recording (guarantees we won't resend)
  // Kafka handles offset commit
};

// Why this works:
// - Kafka ensures we don't reprocess same message
// - But if consumer crashes, it might see message again
// - EmailLog prevents duplicate sends
// - Email service sees: "already sent, skip"
// - Result: Exactly once
```

**6. Monitoring end-to-end:**

```typescript
// Correlation IDs trace requests
const handleRegistration = async (req) => {
  const correlationId = generateId();
  
  const event = {
    correlationId,  // ← Includes in event
    eventId: req.body.eventId,
    registrationId: registration._id,
    // ...
  };
  
  // Publish event
  await kafka.send({
    topic: 'registration-events',
    messages: [{key: event.eventId, value: JSON.stringify(event)}]
  });
  
  return {registrationId: registration._id, correlationId};
};

// Subscriber passes correlationId through logs
const handleEvent = async (event) => {
  const {correlationId} = event;
  
  logger.info('Processing registration', {correlationId});
  // All logs include this ID
};

// Dashboard can trace single registration through all services
// Search for correlationId → see:
// - API call
// - Event published
// - Email sent
// - Analytics updated
// - Billing recorded

// Monitoring lag
const monitorServiceLag = async () => {
  const lag = {};
  
  const consumers = ['email', 'analytics', 'billing'];
  for (const service of consumers) {
    const offset = await kafka.consumer(service).getOffsets();
    const topicEnd = await kafka.getTopicEnd();
    lag[service] = topicEnd - offset;
    
    if (lag[service] > 1000) {
      alert(`${service} service is 1000+ messages behind`);
    }
  }
  
  return lag;
};

// Dead-letter queue for failures
const deadLetterHandler = async (topic) => {
  const dlq = kafka.consumer({groupId: 'dlq-handler'});
  
  await dlq.subscribe({topic: 'registration-events.dlq'});
  
  await dlq.run({
    eachMessage: async ({message}) => {
      const event = JSON.parse(message.value);
      
      // Log for manual review
      await DLQLog.create({
        topic,
        event,
        receivedAt: new Date()
      });
      
      // Alert operator
      alert(`DLQ message received: ${event.eventType} for event ${event.eventId}`);
    }
  });
};
```

---

**Comparison to Existing Architecture:**

| Aspect | Current (Sync) | Event-Driven |
|--------|----------------|--------------|
| **Registration flow** | Sync (all side effects together) | Async (multiple subscribers) |
| **Coupling** | Tight (email blocks registration) | Loose (email fails separately) |
| **Scalability** | Limited (all blocked by slowest) | High (each service scales independently) |
| **Debugging** | Single request trace | Correlation ID across services |
| **Failure impact** | Email down = registration fails | Email down = registration succeeds |
| **Message guarantee** | N/A | At-least-once (idempotency handles duplicates) |

**What might you have missed:**

1. **Partition by eventId** - Ensures ordering
2. **Idempotency keys** - Handles duplicate processing
3. **Correlation IDs** - Traces across services
4. **Dead-letter queue** - Captures failed messages
5. **Schema versioning** - Handle future field additions
6. **Service independence** - One subscriber failing doesn't block others

---

## Scenario 6.2: Multi-Tenancy

**Requirement:**
Currently, one Evenregman instance per customer.

New: Single instance for 100 customer organizations. Each sees only their own events/registrations. Billing per organization.

How do you redesign for multi-tenancy without breaking single-tenant?

---

### YOUR TURN

**1. Where does tenantId go?**
- Every table?
- Just top-level?
- Partitioning strategy?

**2. Authentication:**
- Users can access multiple tenants?
- Or one tenant per user?

**3. Data isolation:**
- Database isolation or row-level?
- Schema per tenant or shared?

**4. Query complexity:**
- Every query filtered by tenantId?
- How to prevent leaks?

**5. Billing:**
- Per-tenant usage tracking?
- How to charge correctly?

**6. Testing:**
- How do you verify isolation?
- Prevent cross-tenant leaks?

---

### SOLUTION REVEALED

**Ideal Approach:**

**1. TenantId everywhere (row-level security):**

```typescript
// Schema: Add tenantId to every table

// Events collection
{
  _id: ObjectId,
  tenantId: ObjectId,  // ← Which customer
  name: "Conference 2024",
  capacity: 1000,
  // ...
}

// Registrations collection
{
  _id: ObjectId,
  tenantId: ObjectId,  // ← Same as event's tenant
  eventId: ObjectId,
  userId: ObjectId,
  status: "confirmed",
  // ...
}

// Users collection
{
  _id: ObjectId,
  tenantId: ObjectId,  // ← User belongs to this tenant
  email: "user@company.com",
  // ...
}

// Index for performance
db.events.createIndex({tenantId: 1, _id: 1});
db.registrations.createIndex({tenantId: 1, eventId: 1});
```

**Why row-level?**
- Simpler than separate databases (operational simplicity)
- Cheaper than separate MongoDB instances
- Shared resources scale better
- But requires vigilant filtering

**2. Authentication & authorization:**

```typescript
// User can belong to multiple organizations
interface User {
  _id: ObjectId,
  email: string,
  tenants: [
    {
      tenantId: ObjectId,
      role: 'admin' | 'host' | 'guest',
      permissions: ['create_event', 'view_registrations', ...]
    }
  ]
}

// On login
const login = async (email, password) => {
  const user = await User.findOne({email});
  
  // Verify password
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new UnauthorizedError();
  
  // Return JWT with tenants
  const token = jwt.sign({
    userId: user._id,
    email: user.email,
    tenants: user.tenants  // All tenants user has access to
  });
  
  return token;
};

// When accessing resource
const getEvents = async (req) => {
  const {tenantId} = req.query;
  const {userId, tenants} = req.user;  // From JWT
  
  // Verify user has access to this tenant
  const access = tenants.find(t => t.tenantId === tenantId);
  if (!access) {
    throw new ForbiddenError('Access denied to this tenant');
  }
  
  // Query only for this tenant
  const events = await Event.find({
    tenantId,
    hostId: userId  // Only events hosted by this user
  });
  
  return events;
};
```

**3. Data isolation (filter every query):**

```typescript
// Middleware ensures tenantId in all requests
app.use(async (req, res, next) => {
  if (!req.query.tenantId && !req.body.tenantId) {
    return res.status(400).json({error: 'tenantId required'});
  }
  
  const tenantId = req.query.tenantId || req.body.tenantId;
  const {tenants} = req.user;
  
  // Verify access
  if (!tenants.find(t => t.tenantId === tenantId)) {
    return res.status(403).json({error: 'Access denied'});
  }
  
  // Attach to request
  req.tenantId = tenantId;
  next();
});

// Unsafe query (would leak data)
// ❌ db.events.find({hostId: userId})
// Shows events from ALL tenants!

// Safe query (filters by tenant)
// ✓ db.events.find({tenantId, hostId: userId})
// Shows only events from this tenant

// Repository pattern enforces this
class EventRepository {
  async findByHost(tenantId, userId) {
    return await Event.find({tenantId, hostId: userId});
    // Always includes tenantId filter
  }
}
```

**4. Query patterns:**

```typescript
// Before multi-tenancy:
const getRegistrationsForEvent = async (eventId) => {
  return await Registration.find({eventId});
};

// After multi-tenancy:
const getRegistrationsForEvent = async (tenantId, eventId) => {
  // Must filter by both
  return await Registration.find({
    tenantId,        // ← Critical
    eventId
  });
};

// Indexes must include tenantId for performance
db.registrations.createIndex({tenantId: 1, eventId: 1, status: 1});
// (tenantId first for filtering, then eventId for range, then status)
```

**5. Billing & usage tracking:**

```typescript
// New table for usage
interface UsageRecord {
  _id: ObjectId,
  tenantId: ObjectId,
  month: string,  // "2024-08"
  
  metrics: {
    registrationsProcessed: 15000,
    eventHosted: 12,
    storageGB: 5.2,
    apiCallsThousands: 450
  },
  
  billingAmount: {
    registration: 15000 * 0.10,  // $0.10 per registration
    events: 12 * 50,              // $50 per event
    storage: 5.2 * 1,              // $1 per GB
    api: 450 * 10,                 // $10 per 1000 calls
    total: 1500 + 600 + 5 + 4500  // = $6,605
  }
}

// Daily aggregation job
const trackUsage = async () => {
  for (const tenant of await getAllTenants()) {
    const registrations = await Registration.countDocuments({
      tenantId: tenant._id,
      createdAt: {$gte: startOfMonth}
    });
    
    const events = await Event.countDocuments({
      tenantId: tenant._id,
      createdAt: {$gte: startOfMonth}
    });
    
    await UsageRecord.updateOne(
      {tenantId: tenant._id, month: '2024-08'},
      {
        $set: {
          'metrics.registrationsProcessed': registrations,
          'metrics.eventHosted': events
        }
      },
      {upsert: true}
    );
  }
};
```

**6. Testing isolation:**

```typescript
// Test 1: Cross-tenant leak prevention
test('cannot see events from other tenant', async () => {
  // Create two tenants
  const tenant1 = await createTenant('company1.com');
  const tenant2 = await createTenant('company2.com');
  
  // User from tenant1
  const user1 = await createUser(tenant1, 'user@company1.com');
  
  // Event in tenant2
  const event2 = await createEvent(tenant2, 'Tech Conference');
  
  // Try to access tenant2's event as user1
  const response = await getEvents({
    tenantId: tenant2._id,
    userId: user1._id
  });
  
  // Must be denied
  expect(response.error).toBe('Access denied');
  expect(response.events).toBeUndefined();
});

// Test 2: Query injection prevention
test('tenantId filter applied to all queries', async () => {
  // Spy on MongoDB find calls
  const spy = jest.spyOn(db, 'find');
  
  // Get registrations
  await getRegistrations(tenantId, eventId);
  
  // Verify tenantId was included in query
  expect(spy).toHaveBeenCalledWith(
    expect.objectContaining({tenantId})
  );
});

// Test 3: Billing accuracy
test('usage tracking accurate per tenant', async () => {
  const tenant1 = await createTenant();
  const tenant2 = await createTenant();
  
  // Create registrations in both
  await createRegistrations(tenant1, 100);
  await createRegistrations(tenant2, 50);
  
  // Run tracking job
  await trackUsage();
  
  // Check billing
  const bill1 = await getUsage(tenant1);
  const bill2 = await getUsage(tenant2);
  
  expect(bill1.metrics.registrations).toBe(100);
  expect(bill2.metrics.registrations).toBe(50);
});
```

---

**Comparison to Existing Architecture:**

| Aspect | Current | Multi-Tenant |
|--------|---------|--------------|
| **Database** | Per-customer | Shared with row-level security |
| **TenantId** | None (implicit) | Every table (explicit) |
| **Query complexity** | Simple | Every query filtered by tenantId |
| **Isolation** | Database level | Row level (requires discipline) |
| **Operational cost** | 100 DBs | 1 DB + monitoring |
| **Security risk** | Low (isolated DB) | Higher (must filter correctly) |

**What might you have missed:**

1. **TenantId in every query** - Critical for isolation
2. **Middleware enforces tenantId** - Prevents forgetting it
3. **Repository pattern helps** - Centralize filtering logic
4. **Indexes must include tenantId** - For performance
5. **Testing for leaks** - Cross-tenant queries must fail
6. **Billing per tenant** - Separate usage tracking

---

---

## Using This Scenario Guide

**For each scenario:**
1. Read the requirement carefully
2. Work through the 6 questions (write your answers)
3. Think about what you'd actually do
4. Scroll to "Solution Revealed"
5. Compare your approach against the ideal
6. Identify what you'd do differently next time

**Progressive difficulty:**
- **Level 1-3**: Build foundational reasoning
- **Level 4-5**: Learn to handle edge cases and failures
- **Level 6**: Practice architectural thinking at scale

**Next steps after scenarios:**
- Pick a scenario
- Implement your solution in code
- Test it thoroughly
- Document your tradeoffs
- Compare against the revealed solution

This exercise forces you to **reason about the system** rather than just memorizing it.

Good luck! 🎯
