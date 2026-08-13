# Evenregman - Senior Engineer Examination Guide

Complete assessment framework with 12 levels of progressively harder questions, model answers, and scoring rubrics.

---

## Table of Contents

- [Level 1: Repository Structure](#level-1-repository-structure)
- [Level 2: Components](#level-2-components)
- [Level 3: Data Flow](#level-3-data-flow)
- [Level 4: Runtime Behavior](#level-4-runtime-behavior)
- [Level 5: Design Patterns](#level-5-design-patterns)
- [Level 6: Architecture Decisions](#level-6-architecture-decisions)
- [Level 7: Tradeoffs](#level-7-tradeoffs)
- [Level 8: Failure Modes](#level-8-failure-modes)
- [Level 9: Security](#level-9-security)
- [Level 10: Performance](#level-10-performance)
- [Level 11: Scalability](#level-11-scalability)
- [Level 12: Architectural Redesign](#level-12-architectural-redesign)

---

# LEVEL 1: REPOSITORY STRUCTURE

## Question 1.1: Code Organization

**Question:**
> Walk me through where you would find the code that handles a guest registration request. Start from the HTTP request arriving at the API endpoint, and trace through the directory structure showing me each layer of abstraction until you reach the database persistence.

**What we're testing:**
- Do they know the physical layout?
- Do they understand layering?
- Can they navigate the codebase?
- Do they understand separation of concerns?

**Model Answer:**

The registration flow spans these directories:

1. **API Layer** (`src/app/api/registrations/route.ts`)
   - HTTP POST handler
   - Responsibility: Parse JSON, extract userId from auth, call service
   ```
   POST /api/registrations → route.ts:POST()
   ```

2. **Service Layer** (`src/features/registrations/registerForEvent.ts`)
   - Business logic orchestration
   - Responsibility: Authorization checks, call atomic engine, audit logging, queue notifications
   ```
   registerForEvent(eventId, seatsRequested, userId)
   ```

3. **Domain Logic** (`src/lib/atomic-reservation.ts`)
   - Pure algorithm
   - Responsibility: Transaction management, capacity checking, registration creation
   ```
   atomicReservation(eventId, seatsRequested, userId)
   ```

4. **Repository Layer** (Mongoose models: `src/models/Registration.ts`, `src/models/Event.ts`)
   - Data access
   - Responsibility: Query builders, schema validation
   ```
   Registration.create() / Event.findById()
   ```

5. **Database** (MongoDB)
   - Persistence
   - Responsibility: Data storage, transactions

**Scoring Rubric:**

| Score | Criteria |
|-------|----------|
| **10** | Correct path through all 5 layers, understands responsibility at each level, knows exact file paths |
| **8-9** | Correct layers identified, minor gaps (e.g., not sure about middleware), right general structure |
| **6-7** | Identifies main flow but skips middleware/validation layers, or mixes up layer responsibilities |
| **4-5** | Finds registration code but doesn't understand layering, or traces wrong path |
| **0-3** | Can't locate registration code or fundamentally misunderstands structure |

**Common Mistakes:**

1. **Missing middleware layer** - Forgets `authMiddleware` validates JWT before handler
2. **Wrong layer responsibilities** - Thinks validator is in service layer (it's middleware)
3. **API route confusion** - Confuses `src/app/` (Next.js pages) with `src/app/api/` (API routes)
4. **Model confusion** - Thinks model is same as repository (it's not; Mongoose is ORM)

---

## Question 1.2: Where Does CDC Live?

**Question:**
> Where in the codebase would you find the CDC (Change Data Capture) worker? How is it different from the API code? When and how often does it run?

**What we're testing:**
- Do they know there are separate worker processes?
- Do they understand the difference between synchronous (API) and asynchronous (workers)?
- Can they find code that runs outside the request/response cycle?

**Model Answer:**

**Location:** `src/workers/cdc-worker.ts`

**How it differs from API:**

| Aspect | API | CDC Worker |
|--------|-----|-----------|
| **Trigger** | HTTP request (on-demand) | Timer/interval (every 5 seconds) |
| **Latency** | Must be fast (< 100ms) | Can be slow (takes minutes if needed) |
| **Failure** | Blocks user (immediate feedback) | Asynchronous (user doesn't wait) |
| **Start/Stop** | Per request | Once on app startup |
| **Code path** | `src/app/api/` | `src/workers/` |

**How it runs:**

```typescript
// File: src/workers/cdc-worker.ts
setInterval(async () => {
  // Every 5 seconds
  const changes = await getChangesFromOplog();
  await projectToAnalytics(changes);
}, 5000);
```

**Scoring Rubric:**

| Score | Criteria |
|-------|----------|
| **10** | Correct file, understands it's separate process, knows timing/frequency |
| **8-9** | Correct file, understands async nature, minor details missing |
| **6-7** | Finds worker code but unclear on how it starts or timing |
| **4-5** | Knows it exists but wrong file or wrong understanding of purpose |
| **0-3** | Can't locate workers or thinks it runs in API process |

**Follow-up Question:**
> If CDC worker crashes, what happens to the dashboard? Why doesn't the registration endpoint crash?

---

## Question 1.3: Authentication Layers

**Question:**
> The system uses JWT + OAuth. Where would you find this code? Draw a simple map showing the three places authentication matters: (1) When user logs in, (2) When user makes API request, (3) When user accesses protected page.

**What we're testing:**
- Do they understand authentication spans multiple layers?
- Frontend vs backend auth concerns?
- Entry points for different actors?

**Model Answer:**

**Three auth locations:**

1. **Auth Endpoint** (`src/app/api/auth/[...].ts`)
   - OAuth flow: GitHub/Google login
   - Creates JWT token
   - Returns token to client

2. **API Middleware** (`src/middleware.ts` or auth middleware in each route)
   - Validates JWT from cookie/header
   - Extracts userId
   - Attaches to request

3. **Frontend** (`src/app-premium/` routes)
   - Checks if logged in (JWT exists)
   - Redirects to login if missing
   - Passes JWT on API calls

**Scoring Rubric:**

| Score | Criteria |
|-------|----------|
| **10** | Correctly identifies all 3 locations, understands each purpose, knows file paths |
| **8-9** | Identifies locations, minor gaps on file paths or one location unclear |
| **6-7** | Understands concept but can't locate all code |
| **0-6** | Confuses frontend/backend or thinks auth is one location |

---

# LEVEL 2: COMPONENTS

## Question 2.1: The Atomic Reservation Engine

**Question:**
> Explain what the `AtomicReservationEngine` does and why it can't be implemented as a simple if-statement in the service layer. What would go wrong if we moved this logic into the service layer without MongoDB transactions?

**What we're testing:**
- Do they understand why specific components exist?
- Do they understand concurrency problems?
- Can they reason about what breaks without transactions?

**Model Answer:**

**What it does:**
Prevents overbooking by ensuring that the sequence "check capacity → create registration → update counter" happens atomically (all-or-nothing).

**Why not in service layer:**

If we did this in service layer WITHOUT transactions:

```typescript
// WRONG - Race condition!
async function registerInService(eventId, seats) {
  const event = await Event.findById(eventId); // Check
  
  if (event.registeredCount + seats <= event.totalCapacity) {
    // Two threads both pass the check here!
    const reg = await Registration.create({...}); // Create
    event.registeredCount += seats; // Update
    await event.save();
  }
}
```

**What breaks:**

Thread A: Check → 95 seats (OK)
Thread B: Check → 95 seats (OK)
Thread A: Register 5 → counter = 100
Thread B: Register 5 → counter = 100 (WRONG! Should be 105)

**With transactions (current approach):**

```typescript
// CORRECT - Atomic
const session = await mongoose.startSession();
session.startTransaction();

// Only one thread can do this at a time
const event = await Event.findById(eventId, null, {session});
if (event.registeredCount + seats <= event.totalCapacity) {
  // Create and update happen together, atomically
  await Registration.create([{...}], {session});
  event.registeredCount += seats;
  await event.save({session});
}

await session.commitTransaction();
```

**Why separate component:**
- Separates business logic (should we register?) from infrastructure (how do we make it atomic?)
- Easier to test
- Can be reused by cancellation logic too

**Scoring Rubric:**

| Score | Criteria |
|-------|----------|
| **10** | Explains atomicity problem, shows race condition clearly, understands why separation matters |
| **8-9** | Correct explanation, minor gaps on implementation details |
| **6-7** | Understands atomicity is needed, but explanation unclear or incomplete |
| **4-5** | Recognizes transactions are needed but doesn't explain why |
| **0-3** | Doesn't understand the problem or why separation matters |

**Follow-up if score < 8:**
> How would you test that atomicity works? What test would catch the race condition?

---

## Question 2.2: CDC Projection Engine

**Question:**
> The CDC worker uses a projection engine to transform database changes into analytics format. Why can't the dashboard just query the registrations table directly? What problem does the projection solve?

**What we're testing:**
- Do they understand the performance problem?
- Do they understand algorithmic complexity (O(n) vs O(1))?
- Can they reason about scalability?

**Model Answer:**

**Problem with direct query:**

```typescript
// SLOW - Direct aggregation
const result = await db.registrations.aggregate([
  {$match: {eventId, status: 'confirmed'}},
  {$group: {_id: null, count: {$sum: 1}}}
]);
// With 1M registrations: ~1 second query
// With 10M registrations: ~10 second query (unusable)
```

**What projection solves:**

Projection pre-aggregates data:
```typescript
// FAST - Pre-aggregated
const result = await db.analytics.findOne({eventId});
// With 1M registrations: ~1 millisecond query
// With 10M registrations: ~1 millisecond query (constant time)
```

**The transformation:**

Database change (registration) → Analytics aggregation (count += 1)

**Why it matters:**
- Dashboard queries must be < 100ms
- Direct aggregation grows linearly with data (O(n))
- Pre-aggregation is constant (O(1))
- Can't make registration fast without hurting dashboard

**Scoring Rubric:**

| Score | Criteria |
|-------|----------|
| **10** | Explains O(n) vs O(1), shows scaling problem, understands tradeoff (storage for speed) |
| **8-9** | Correct explanation, minor complexity analysis gaps |
| **6-7** | Understands projection needed but explanation unclear |
| **4-5** | Knows projection exists but doesn't explain why |
| **0-3** | Doesn't understand the problem |

**Follow-up if score < 8:**
> If the analytics database becomes out of sync with registrations (CDC is 5 minutes behind), what should the dashboard show? Why?

---

# LEVEL 3: DATA FLOW

## Question 3.1: From Registration to Dashboard

**Question:**
> Trace the complete data flow from when a guest clicks "Register" to when the host sees the updated capacity on the dashboard. Include:
> - When does the user see confirmation?
> - When does CDC pick up the change?
> - When does dashboard show updated number?
> - Where can this process fail?

**What we're testing:**
- Do they understand timing of different components?
- Do they understand asynchronous vs synchronous?
- Can they identify failure points?

**Model Answer:**

**Timeline:**

| Time | What Happens | Who | Why |
|------|--------------|-----|-----|
| **T=0ms** | Guest clicks register | Browser | User action |
| **T=50ms** | HTTP POST to `/api/registrations` | API | Request sent |
| **T=100ms** | Auth verified, input validated | API middleware | Security check |
| **T=150ms** | Atomic transaction starts | API service | Begin atomicity |
| **T=200ms** | Registration created, counter updated | MongoDB | Database write |
| **T=250ms** | Email queued to job queue | API service | Async notification |
| **T=300ms** | **Response sent to guest** | API | Guest sees confirmation ✓ |
| **T=5,000ms** | CDC worker polls oplog | CDC worker | Periodic check |
| **T=5,050ms** | Change detected | CDC worker | Found in oplog |
| **T=5,100ms** | Projected to analytics DB | CDC worker | Pre-aggregation |
| **T=5,150ms** | Host refreshes dashboard | Dashboard | Manual action |
| **T=5,200ms** | Dashboard queries analytics | Dashboard | Fetch fresh data |
| **T=5,250ms** | **Host sees updated count** | Host | UI updates ✓ |

**Failure points:**

1. **API failure** (T=0-300ms) → Guest sees error, registration not created
2. **Email queue failure** (T=250ms) → Email not sent, but registration succeeds (acceptable)
3. **CDC failure** (T=5,000ms) → Analytics stale, dashboard shows old count
4. **Oplog rolls off** → CDC can't recover, resync needed

**Scoring Rubric:**

| Score | Criteria |
|-------|----------|
| **10** | Identifies all key moments, understands sync/async split, names failure points |
| **8-9** | Mostly correct, minor timing gaps, identifies most failure points |
| **6-7** | Correct flow but timing estimates wrong, or misses some failure points |
| **4-5** | General flow correct but significant gaps |
| **0-3** | Fundamentally confused about timing |

**Follow-up if score < 8:**
> If CDC falls 5 minutes behind (due to slow oplog polling), should we wait for CDC before responding to registration? Why or why not?

---

## Question 3.2: Data Transformations

**Question:**
> Take a registration like this:
> ```json
> {
>   "eventId": "507f...",
>   "userId": "507g...",
>   "seatsRequested": 5,
>   "status": "confirmed",
>   "createdAt": "2024-08-14T12:34:56Z"
> }
> ```
> Walk me through every transformation this data goes through from API request to analytics database. What fields get added/removed/changed at each step?

**What we're testing:**
- Do they understand data flow through layers?
- Can they track transformations?
- Do they understand data model mapping?

**Model Answer:**

**Transformation Journey:**

1. **HTTP Request** (Browser → API)
   ```json
   {
     "eventId": "507f...",
     "seatsRequested": 5
   }
   // Note: userId comes from JWT, not request
   ```

2. **Validated Input** (Middleware)
   ```typescript
   {
     eventId: ObjectId("507f..."),
     seatsRequested: 5, // Must be 1-10
     userId: ObjectId("507g...")  // Extracted from JWT
   }
   ```

3. **Domain Object** (Service layer)
   ```typescript
   {
     eventId: ObjectId("507f..."),
     userId: ObjectId("507g..."),
     seatsRequested: 5,
     requestTime: Date.now()
   }
   ```

4. **Database Record** (Before write)
   ```typescript
   {
     _id: ObjectId("507h..."),  // Generated
     eventId: ObjectId("507f..."),
     userId: ObjectId("507g..."),
     seatsRequested: 5,
     status: "confirmed",  // Determined by capacity check
     confirmedAt: Date.now(),  // Added if confirmed
     createdAt: Date.now()  // Added by schema
   }
   ```

5. **CDC Change Event** (Oplog)
   ```typescript
   {
     operationType: "insert",
     ns: {db: "evenregman", coll: "registrations"},
     fullDocument: {  // Entire record
       _id: ObjectId("507h..."),
       eventId: ObjectId("507f..."),
       ...
     }
   }
   ```

6. **Projected Analytics** (CDC projection)
   ```typescript
   {
     eventType: "registration",
     hourBucket: ISODate("2024-08-14T12:00:00Z"),  // Rounded to hour
     dimensions: {
       eventId: ObjectId("507f...")  // Only key dimensions
     },
     metrics: {
       count: 1,  // Incrementing metric
       seatsRequested: 5,
       confirmed: 1
     },
     updatedAt: Date.now()  // Projection timestamp
   }
   ```

7. **API Response** (API → Browser)
   ```json
   {
     "status": "confirmed",
     "registrationId": "507h...",
     "confirmedAt": "2024-08-14T12:34:56Z"
   }
   ```

**Scoring Rubric:**

| Score | Criteria |
|-------|----------|
| **10** | Shows transformation at each layer, explains why fields added/removed, understands projection |
| **8-9** | Mostly correct transformations, minor gaps |
| **6-7** | Correct general flow but misses some transformations or explanations |
| **4-5** | Identifies main transformations but significant gaps |
| **0-3** | Confused about data model or transformation process |

---

# LEVEL 4: RUNTIME BEHAVIOR

## Question 4.1: Transaction Lifecycle

**Question:**
> Walk me through exactly what happens when two guests try to register for the last seat simultaneously. Be specific about:
> - When locks are acquired
> - When database reads happen
> - What each thread sees
> - In what order do they complete
> - What's the final state?

**What we're testing:**
- Do they understand database locking?
- Can they think through concurrent execution?
- Do they understand serializability?

**Model Answer:**

**Setup:**
- Event has 100 seats total
- 99 seats already registered
- 1 seat available
- Two guests try to register for 1 seat each, at exact same time

**Thread A and Thread B both start at T=0**

**T=0:**
```
Thread A: session.startTransaction()
Thread B: session.startTransaction()
```

**T=5ms (Thread A acquires lock):**
```
Thread A: Event.findById(eventId, null, {session})
          → Lock acquired on Event document
Thread B: WAITS for lock on Event
```

**T=10ms (Thread A reads capacity):**
```
Thread A: event.registeredCount = 99 (reads from DB)
          Check: 99 + 1 <= 100? YES ✓
```

**T=15ms (Thread A writes):**
```
Thread A: Registration.create({...})  // Create registration #1
          event.registeredCount = 100  // Update counter
          event.save({session})
```

**T=20ms (Thread A commits, lock released):**
```
Thread A: session.commitTransaction()
          → LOCK RELEASED
Response to Thread A: {status: "confirmed", id: reg#1}
```

**T=21ms (Thread B acquires lock):**
```
Thread B: Event.findById(eventId, null, {session})
          → Lock acquired
```

**T=25ms (Thread B reads capacity):**
```
Thread B: event.registeredCount = 100 (reads current value)
          Check: 100 + 1 <= 100? NO ✗
```

**T=30ms (Thread B creates waitlist):**
```
Thread B: Registration.create({status: "waitlisted"})
          event.waitlistedCount = 1
          event.save({session})
```

**T=35ms (Thread B commits):**
```
Thread B: session.commitTransaction()
Response to Thread B: {status: "waitlisted", id: reg#2}
```

**Final state:**
- Event.registeredCount = 100 ✓ (exactly capacity)
- Event.waitlistedCount = 1 ✓ (correct)
- reg#1 = confirmed ✓
- reg#2 = waitlisted ✓

**Why this works:**
- Lock serializes access (one thread at a time)
- Thread B sees Thread A's writes (correct capacity)
- Both threads see consistent state
- No overbooking possible

**Without transactions (wrong):**
```
Thread A: Check 99 + 1 <= 100? YES
Thread B: Check 99 + 1 <= 100? YES  ← Both passed!
Thread A: Create, update to 100
Thread B: Create, update to 100  ← WRONG! Counter should be 101
Result: Overbooking! 2 guests for 1 seat
```

**Scoring Rubric:**

| Score | Criteria |
|-------|----------|
| **10** | Shows lock acquisition, timing, both threads' perspective, identifies lock serialization |
| **8-9** | Correct sequence, minor timing details missing |
| **6-7** | Understands lock concept, sequence mostly correct |
| **4-5** | Vague on timing or lock behavior |
| **0-3** | Fundamentally confused about threading or locking |

**Follow-up if score < 8:**
> What if Thread A crashes after acquiring lock but before committing? Does the lock get released?

---

## Question 4.2: SSE Stream Lifecycle

**Question:**
> A host opens the audit dashboard and connects to the SSE stream at `/api/sse/audit`. Walk me through:
> - What happens when the connection opens?
> - How often does data arrive?
> - If the network drops and reconnects, what happens?
> - If the SSE worker crashes, what does the host see?

**What we're testing:**
- Do they understand Server-Sent Events?
- Do they understand push vs pull?
- Can they reason about connection lifecycle?

**Model Answer:**

**Connection Lifecycle:**

**T=0 (Host connects):**
```typescript
// Browser code
const eventSource = new EventSource('/api/sse/audit');

// Server receives connection
const stream = new ReadableStream({
  start(controller) {
    // Stream started, ready to send
  }
});
```

**T=100ms (First audit events):**
```
Server → Browser:
data: {"action": "register", "userId": "507f...", "timestamp": "..."}

Browser: Receives onmessage event
Updates audit list
```

**T=5,000ms (Periodic events):**
```
// Server sends every 5 seconds (demo mode)
Server → Browser: New audit entries

Browser: Updates automatically
```

**Network drops at T=20,000ms:**
```
Connection lost
Browser: ERROR event fires

// Browser code handles it:
eventSource.onerror = () => {
  setConnected(false);
  setTimeout(() => reconnect(), 3000);
};
```

**T=23,000ms (Reconnects):**
```
Browser: new EventSource('/api/sse/audit')
Server: New stream started
Browser: Receives entries from this point forward
```

**Note:** Lost entries between T=20s and T=23s (3-second gap)

**SSE Worker crashes at T=40,000ms:**
```
Server stops sending data
Browser: Keeps connection open
Host sees: "Disconnected" status
After timeout: Reconnect fails repeatedly
```

**Scoring Rubric:**

| Score | Criteria |
|-------|----------|
| **10** | Shows connection lifecycle, timing, understands data loss on reconnect, knows what happens on crash |
| **8-9** | Correct flow, minor gaps on reconnect behavior |
| **6-7** | Understands SSE but vague on lifecycle |
| **4-5** | Basic understanding but significant gaps |
| **0-3** | Confused about SSE or connection handling |

**Follow-up if score < 8:**
> If you wanted to guarantee no audit entries are lost during a 3-second network glitch, how would you design it differently?

---

# LEVEL 5: DESIGN PATTERNS

## Question 5.1: Which Pattern is This?

**Question:**
> The registration process creates a registration record in MongoDB AND writes to an Outbox table, both in the same transaction. What design pattern is this? Why can't we just rely on CDC reading directly from the registrations collection oplog?

**What we're testing:**
- Do they recognize the Outbox pattern?
- Do they understand why CDC needs it?
- Can they reason about failure modes?

**Model Answer:**

**Pattern:** Outbox Pattern (also called Event Outsourcing)

**Why it exists:**

Problem: CDC watches MongoDB oplog for changes. But what if:
1. Registration written to DB
2. Transaction committed
3. Server crashes before oplog is flushed
4. CDC never sees the registration

Or:
1. Registration written
2. Oplog updated
3. Network fails between server and CDC worker
4. CDC misses the entry

**Solution: Outbox Pattern**

Write BOTH in same transaction:
```typescript
await session.startTransaction();
await Registration.create({...}, {session});  // Operational data
await Outbox.create({...}, {session});         // CDC marker
await session.commitTransaction();
```

Now if crash happens:
- Both written or both rolled back
- No partial state
- CDC can't miss events (oplog might show registration, but Outbox confirms intent)

**Why not just oplog:**
- Oplog can roll off (too old data lost)
- Oplog is meant for replication, not application use
- Race conditions possible

**Scoring Rubric:**

| Score | Criteria |
|-------|----------|
| **10** | Names pattern, explains failure scenario, understands why it's needed |
| **8-9** | Correct pattern, good explanation, minor gaps |
| **6-7** | Identifies pattern, explanation partial |
| **4-5** | Knows CDC matters, but doesn't connect to Outbox pattern |
| **0-3** | Doesn't recognize the pattern |

**Follow-up:**
> If Outbox table gets corrupted and shows duplicate entries, what breaks?

---

## Question 5.2: Other Patterns

**Question:**
> Name three other design patterns you see in this codebase. For each, explain:
> - What problem does it solve?
> - Where is it used?
> - What would break without it?

**What we're testing:**
- Can they recognize patterns?
- Do they understand pattern purposes?
- Can they identify consequences?

**Model Answer:**

**Pattern 1: Repository Pattern**

Location: `src/models/` (Mongoose models act as repositories)

Problem: Decouple business logic from data access details

What would break: Every service would need to know MongoDB syntax, schema details

```typescript
// Service doesn't know how data is stored
await registrationRepo.create({...});

// Implementation hidden
// Could switch to PostgreSQL tomorrow, service unchanged
```

**Pattern 2: Circuit Breaker Pattern**

Location: `src/lib/circuit-breaker.ts`

Problem: Prevent cascading failures when external services fail

What would break:
- Email service down → Try to send 10,000 emails
- Each fails, retries, wastes resources
- API gets slow
- Database queue backs up

With circuit breaker:
- After 3 failures → OPEN (reject fast)
- After 30 seconds → HALF_OPEN (test one)
- If succeeds → CLOSED (resume)

**Pattern 3: Cache-Aside Pattern**

Location: `src/lib/cache.ts` (L1 Redis, L2 memory)

Problem: Database is slow, cache is fast

Pattern:
```typescript
1. Try cache
2. If miss, query database
3. Store in cache
4. Return
```

What would break: Without cache, dashboard queries would be 100x slower

**Other patterns present:**
- **Service Locator** (Provider pattern for React Query)
- **Observer** (Event emitters for CDC)
- **Saga** (Implicit - registration triggers email saga)
- **Atomic Transactions** (for atomicity)

**Scoring Rubric:**

| Score | Criteria |
|-------|----------|
| **10** | Identifies 3+ patterns, explains problem/solution/location for each |
| **8-9** | 3 patterns, mostly correct explanations |
| **6-7** | 2-3 patterns, partial explanations |
| **4-5** | 1-2 patterns, vague explanations |
| **0-3** | Can't identify patterns |

---

# LEVEL 6: ARCHITECTURE DECISIONS

## Question 6.1: Why MongoDB Not PostgreSQL?

**Question:**
> This system uses MongoDB. For registrations and events with atomic transactions, why not use PostgreSQL which has stronger ACID guarantees? What would you gain and lose?

**What we're testing:**
- Do they understand architectural tradeoffs?
- Can they think through pros/cons?
- Do they know the domain fits MongoDB?

**Model Answer:**

**Why MongoDB was chosen:**

Gains:
1. **Transactions + Change Streams** - Both built-in, no separate tooling
2. **Flexible schema** - Event fields can be added without migrations
3. **Document model matches domain** - Event has nested data (registrations, seats)
4. **Node.js integration** - Mongoose is natural, ORM overhead minimal

Losses (if switched to PostgreSQL):
1. **Would need CDC tool** - MongoDB oplog is native, PostgreSQL needs Debezium/WAL-E
2. **More complex setup** - Migrations required for schema changes
3. **ORM complexity** - Sequelize/TypeORM adds abstraction layer
4. **Network hops** - JOINs needed for nested data
5. **Operational overhead** - Need to manage migrations, clustering differently

**Would PostgreSQL be better?**

For this scale? No. PostgreSQL excels at:
- Complex queries (many JOINs)
- Enforced data integrity (foreign keys)
- Large analytical workloads

Evenregman needs:
- Transactions (PostgreSQL has)
- Change streams (PostgreSQL doesn't, needs external tool)
- Flexible schema (PostgreSQL doesn't have)

**When to switch to PostgreSQL:**

1. **Need complex analytics** - Many JOINs between tables
2. **Need strong referential integrity** - Foreign keys prevent orphaned data
3. **Team knows PostgreSQL better** - Operational knowledge matters

**Current decision is reasonable because:**
- Transactions work fine (don't need PostgreSQL's stronger guarantees)
- Change streams built-in (no external tool needed)
- Domain fits document model
- Team proficient with Node.js + MongoDB

**Scoring Rubric:**

| Score | Criteria |
|-------|----------|
| **10** | Shows both sides clearly, understands MongoDB strengths for this domain, knows when to switch |
| **8-9** | Good analysis, minor gaps |
| **6-7** | Understands tradeoff but analysis incomplete |
| **4-5** | Acknowledges tradeoff but doesn't fully explain |
| **0-3** | No understanding of architectural choice |

**Follow-up:**
> At what scale/usage pattern would PostgreSQL become the better choice?

---

## Question 6.2: Why Monolithic + Workers Not Microservices?

**Question:**
> This system is monolithic (single API) with separate worker processes. Why not break it into microservices (Registration Service, Event Service, Export Service, etc.)? What would you gain and lose?

**What we're testing:**
- Do they understand when monolithic makes sense?
- Can they think through complexity?
- Do they understand operational consequences?

**Model Answer:**

**Why monolithic + workers:**

Current approach is pragmatic because:
1. **Single deployment** - Deploy one thing instead of coordinating 5+
2. **Shared database** - No distributed transaction complexity
3. **Shared code** - Business logic reusable across endpoints
4. **Simpler ops** - One monitoring dashboard instead of 5+
5. **Team small** - 1-3 engineers don't need separate services per team

**If split to microservices:**

Registration Service:
- Can scale independently (10x traffic) without scaling others
- Team owns it completely
- Can use different tech (Python for fast iteration)

Event Service:
- Independent deployment
- Independent database

Export Service:
- Completely isolated
- Can crash without affecting registrations

**Costs of microservices:**

1. **Distributed system complexity** - Network latency between services
2. **Data consistency hell** - Transactions span multiple databases (need sagas)
3. **Testing complexity** - Integration tests must set up 5 services
4. **Operational overhead** - 5 services to monitor, deploy, debug
5. **Deployment coordination** - Version compatibility issues
6. **Debugging harder** - Request spans multiple services, logs spread

**When to switch to microservices:**

1. **Team grows** (> 20 engineers) - Can't coordinate on single codebase
2. **Services have different scaling needs** - Export needs to scale 100x, registration only 2x
3. **Technology diversity needed** - CSV export wants Python + pandas
4. **Deployment frequency conflicts** - One team wants 10 deploys/day, other wants 1/month

**For Evenregman currently:**
- Monolithic is right choice
- Could add load balancing if registration traffic becomes bottleneck
- Workers already separate (good compromise)

**Scoring Rubric:**

| Score | Criteria |
|-------|----------|
| **10** | Clear view of both approaches, understands operational cost, knows when to switch |
| **8-9** | Good analysis, minor gaps |
| **6-7** | Understands but incomplete reasoning |
| **4-5** | Mentions complexity but doesn't fully explain |
| **0-3** | No understanding of architectural choice |

**Follow-up:**
> At what team size or traffic would microservices become necessary?

---

# LEVEL 7: TRADEOFFS

## Question 7.1: CDC Tradeoff

**Question:**
> CDC pre-aggregates data into an analytics database. The dashboard shows capacity within 5 seconds of registration. What if you needed < 1 second? What would you change? What would you sacrifice?

**What we're testing:**
- Do they understand the freshness/latency tradeoff?
- Can they redesign for different constraints?
- Do they know the cost?

**Model Answer:**

**Current approach (5-second latency):**
- CDC polls oplog every 5 seconds
- Acceptable for dashboard (humans don't perceive 5s delay)
- Trades: Storage overhead for speed

**If needed < 1 second:**

**Option 1: Change Stream Listener (not polling)**

Current:
```typescript
// Polls every 5s
setInterval(async () => {
  const changes = await getChanges();
  await project(changes);
}, 5000);
```

Better:
```typescript
// Real-time listener
const changeStream = db.collection('registrations').watch();
changeStream.on('change', async (change) => {
  await project(change);  // Immediate
});
```

Cost: 
- Always-on listener (more RAM)
- More complex failure handling (listener can disconnect)
- Still need oplog recovery logic

Gain: < 50ms latency instead of 5s

**Option 2: Update Analytics Inline**

During registration:
```typescript
// In same transaction as registration
await Registration.create({...}, {session});
await Analytics.updateOne({...}, {$inc: {count: 1}}, {session});
```

Cost:
- Registration slows down (analytics write added to critical path)
- Can't backfill analytics (must be created during event)
- Analytics DB downtime blocks registrations

Gain: Immediate consistency, no CDC needed

Tradeoff: Responsiveness vs reliability

**Option 3: Message Queue (Kafka)**

After registration succeeds:
```typescript
await kafka.produce({topic: 'registrations', value: event});
```

Instant worker:
```typescript
kafka.consume({topic: 'registrations'}, async (msg) => {
  await analytics.update(msg);
});
```

Cost:
- Need Kafka infrastructure (complexity)
- Even faster failures (multiple failure points)
- Harder to debug

Gain: Microsecond latency with async isolation

**My recommendation for < 1 second:**

Change Stream Listener (Option 1)
- Better than current, not too complex
- 50ms latency instead of 5s
- Keeps asynchronous (registration not slowed)

**Not Option 2** because registration shouldn't depend on analytics.

**Not Option 3** (Kafka) unless throughput >> 10K reg/sec.

**Scoring Rubric:**

| Score | Criteria |
|-------|----------|
| **10** | Shows multiple options, clear costs for each, makes principled recommendation |
| **8-9** | Good options with costs, reasonable recommendation |
| **6-7** | Identifies options but costs unclear |
| **4-5** | One option mentioned, costs vague |
| **0-3** | No understanding of tradeoffs |

---

## Question 7.2: Atomicity vs Throughput

**Question:**
> Transactions guarantee atomicity but limit throughput (can only register ~125 guests/second per event due to lock contention). What if you needed 10,000 registrations/second? What architectures could support that and what would you sacrifice?

**What we're testing:**
- Do they understand performance tradeoffs?
- Can they think about distributed systems?
- Do they know the costs of eventual consistency?

**Model Answer:**

**Current (125 reg/sec per event):**
```
Thread A: Lock event → Check capacity → Create reg → Update counter → Commit
Thread B: Waits for lock...
```

Bottleneck: Lock serializes everything

**Option 1: Optimistic Locking with Retries**

```typescript
// Try update, check version after
const event = await Event.findById(eventId);
const version = event.version;

const result = await Event.updateOne(
  {_id: eventId, version},
  {$inc: {registeredCount: seats, version: 1}}
);

if (!result.modifiedCount) {
  // Version mismatch, retry
}
```

Throughput: 1000+ reg/sec
Cost: 
- Retries under contention (users see slower response)
- Unfair (fast threads can win repeatedly)
- Complex retry logic

Sacrifice: Consistency guarantees, fairness

**Option 2: Event Sourcing**

Don't update counters, store immutable events:
```typescript
// Insert event (fast, no conflict)
await EventLog.insert({
  type: 'RegistrationRequested',
  eventId, userId, seats,
  timestamp
});

// Compute capacity from events
const total = await EventLog.aggregate([
  {$match: {eventId, type: 'RegistrationConfirmed'}},
  {$group: {_id: null, total: {$sum: '$seats'}}}
]);
```

Throughput: 10,000+ reg/sec (no contention)
Cost:
- Capacity checks slow (must sum all events)
- No strong consistency (capacity might be wrong during peak)
- Storage bloat (keep all events)

Sacrifice: Consistent capacity number, query performance

**Option 3: Sharding by Time Bucket**

Instead of one event, use 10 independent "virtual events":
```typescript
// Route to event-shard-0 through event-shard-9
const shard = hash(userId) % 10;
const shardedEventId = `${eventId}-shard-${shard}`;

// Each shard has 10 seats
// Lock only affects 1/10th of traffic
```

Throughput: 1,250 reg/sec (10x improvement)
Cost:
- Complex counting (must sum across shards)
- Uneven distribution (some shards fill first)
- Must re-shard if one fills (complex migration)

Sacrifice: Simple querying, even distribution

**Option 4: Pre-Assigned Seats + Queue**

Assign seats before registration:
```typescript
// Database has 100 pre-allocated seat IDs
const availableSeat = await Seat.findOneAndUpdate(
  {eventId, status: 'available'},
  {status: 'assigned', userId}
);

// Fast, no capacity check needed
// Throughput: 10,000+ reg/sec
```

Cost:
- Must pre-allocate all seats
- Can't change capacity after creation
- Seat "assignment" different from "registration"

**My recommendation for 10K reg/sec:**

Combination approach:
1. Pre-assign seats (fast)
2. Shard capacity checks (distributed load)
3. Accept eventual consistency for capacity display (≤ 5s stale)

**Sacrifice:** 
- Some evenings might show capacity wrong for 5 seconds
- More complex infrastructure

**Not:** Inline analytics (registration becomes slow)

**Scoring Rubric:**

| Score | Criteria |
|-------|----------|
| **10** | Shows 3+ approaches, clear throughput/cost tradeoffs, principled recommendation |
| **8-9** | 2-3 approaches, good analysis |
| **6-7** | 1-2 approaches, partial analysis |
| **4-5** | Acknowledges throughput issue, no solutions |
| **0-3** | Doesn't understand the constraint |

---

# LEVEL 8: FAILURE MODES

## Question 8.1: What Happens When...

**Question:**
> The CDC worker hasn't processed changes for 30 minutes (it crashed, slowly recovered). During this time, 10,000 guests registered. What happens?
> 
> - What does the dashboard show? (Be specific - capacity numbers, audit log, etc.)
> - What does the guest see?
> - What breaks?
> - How do you fix it?

**What we're testing:**
- Do they understand failure consequences?
- Can they think through multi-layered impact?
- Do they know recovery strategies?

**Model Answer:**

**When CDC is down for 30 minutes:**

| Component | What Happens |
|-----------|--------------|
| **Registrations** | Continue working (CDC separate process) |
| **Database** | 10K new registrations written, counters updated correctly |
| **Analytics DB** | No new data (CDC stopped) |
| **Dashboard** | Shows stale data (30 min old) |
| **Oplog** | Captures all 10K changes (safe) |
| **Audit stream** | Shows recent registrations (not from analytics) |

**Specifically:**

Guest perspective:
- Click register → Get confirmation ✓
- Everything works

Host perspective:
- Dashboard shows "150 registrations" (actually 10,150 now)
- Audit log shows new entries (this comes from different source!)
- Capacity wrong for 30 minutes until CDC catches up

**What breaks:**
- Host makes decision based on wrong capacity (e.g., thinks 10 seats left, actually full)
- Might close registrations incorrectly
- Real-time dashboard becomes lie

**How to fix:**

Short term (immediate):
1. Notice CDC is down (monitoring alert)
2. Restart CDC worker
3. Worker processes backlog of 10K events
4. Dashboard catches up (might take 1-2 minutes)

Medium term:
1. Implement CDC health monitoring
2. Alert on staleness > 5 minutes
3. Dashboard shows warning "data may be stale"

Long term:
1. Change Stream Listener (no polling, instant pickup)
2. Replicate CDC worker for redundancy

**Scoring Rubric:**

| Score | Criteria |
|-------|----------|
| **10** | Shows impact on all layers, understands data divergence, knows recovery steps |
| **8-9** | Good understanding, minor gaps on one layer |
| **6-7** | Understands dashboard affected, but misses some impacts |
| **4-5** | Knows something breaks, but vague |
| **0-3** | Doesn't understand failure impact |

**Follow-up:**
> If the CDC worker crashes DURING the projection of those 10K events (halfway through), what state is the system in?

---

## Question 8.2: Duplicate Registration

**Question:**
> A guest's internet drops after registration is confirmed but before response is received. Guest clicks register again. Two identical POST requests hit the API within 100ms. What happens?
> 
> - Is the guest double-registered?
> - How many email confirmations sent?
> - How many audit log entries?

**What we're testing:**
- Do they understand idempotency?
- Do they know the system's behavior with duplicates?
- Can they identify race conditions?

**Model Answer:**

**What happens:**

| Time | Request A | Request B | Database |
|------|-----------|-----------|----------|
| T=0 | Auth'd, atomicReservation called | Queued | |
| T=5 | Lock acquired | | |
| T=10 | Registration created | | 1 registration |
| T=15 | Counter updated to 96 | Lock acquired | |
| T=20 | Committed | Registration created | **2 registrations!** |
| T=25 | **Response sent to guest** | Counter updated to 96 | |
| T=30 | | Committed | |
| T=35 | | **Response sent to guest** | |

**Results:**

- **Guest double-registered?** YES ✗ (This is a bug!)
- **Email confirmations?** 2 (Both trigger email queue)
- **Audit entries?** 2 (Both logged separately)
- **Seat allocation?** Double-booked (96 + 2 = 98, but only 100 capacity)

**Why this happens:**

No uniqueness constraint on (eventId, userId)

```typescript
// Registration.ts schema
const registrationSchema = new Schema({
  eventId: ObjectId,
  userId: ObjectId,
  // NO: unique index on eventId + userId
});
```

**How to fix:**

Add uniqueness constraint:
```typescript
registrationSchema.index({eventId: 1, userId: 1}, {unique: true});
```

With this fix:
- Request A creates registration successfully
- Request B gets `MongoError: E11000 duplicate key error`
- Returns 409 Conflict to guest
- No double registration

**What about idempotency?**

Even with uniqueness, still not fully idempotent:
- First request might fail after creating registration but before sending email
- Retry creates new registration (caught by uniqueness constraint)
- Guest doesn't see response from first request

Better solution: Idempotency key
```typescript
POST /api/registrations
{
  idempotencyKey: "uuid-from-browser",
  eventId: "...",
  seatsRequested: 5
}
```

- Store idempotency key → response mapping
- If same key arrives, return cached response
- Retry-safe

**Scoring Rubric:**

| Score | Criteria |
|-------|----------|
| **10** | Identifies double-registration bug, shows fix with uniqueness constraint, mentions idempotency |
| **8-9** | Finds bug, correct fix, doesn't mention idempotency |
| **6-7** | Identifies problem but solution unclear |
| **4-5** | Knows something's wrong, vague on fix |
| **0-3** | Doesn't see the issue |

---

# LEVEL 9: SECURITY

## Question 9.1: JWT Attack Vector

**Question:**
> The system uses JWT tokens stored in httpOnly cookies. Explain:
> - Why httpOnly matters
> - How the system could still be vulnerable
> - What authentication attack could work even with httpOnly JWT

**What we're testing:**
- Do they understand JWT vs session tradeoffs?
- Do they know about CSRF, token replay, signature verification?
- Can they think about security assumptions?

**Model Answer:**

**Why httpOnly matters:**

httpOnly flag prevents JavaScript from reading cookie:
```javascript
// This doesn't work with httpOnly
const token = document.cookie.getAuthToken();  // undefined
```

Protects against XSS attacks that steal tokens.

**Remaining vulnerabilities with httpOnly JWT:**

1. **CSRF (Cross-Site Request Forgery)**
   - Attacker tricks user into visiting attacker.com
   - Attacker.com makes request to yoursite.com/api/registrations
   - Browser automatically sends httpOnly cookie
   - Request succeeds (browser sent auth token)

   Fix: CSRF token (separate, unguessable value)

2. **Token Replay**
   - Attacker captures token (via SSL dump, man-in-middle)
   - Uses it to impersonate user indefinitely
   - JWT has no revocation (it's stateless)

   Fix: Short expiry + refresh tokens

3. **Signature Bypass**
   - If JWT secret leaked, attacker can forge tokens
   - No way to know token is fake (can't be revoked)

   Fix: Rotate secrets, monitor for leaks

4. **Clock Skew Attack**
   - Attacker sets system clock ahead
   - Already-expired token becomes valid
   - Checks against local clock (if not synced)

   Fix: Server-side expiry validation

**Is the system vulnerable?**

Depends on implementation:
```typescript
// VULNERABLE - No CSRF protection
app.post('/api/registrations', (req, res) => {
  const token = req.cookies.auth; // Browser sends automatically
  const user = verifyJWT(token);  // No CSRF check
  // Attacker's site can trigger registration
});

// SAFER - Has CSRF token
app.post('/api/registrations', (req, res) => {
  const csrfToken = req.body.csrfToken;
  if (!validateCSRFToken(csrfToken)) throw new ForbiddenError();
  // Attacker can't guess CSRF token
});
```

**Scoring Rubric:**

| Score | Criteria |
|-------|----------|
| **10** | Explains httpOnly benefit, identifies CSRF/replay/signature risks, suggests fixes |
| **8-9** | Good understanding, identifies most risks |
| **6-7** | Understands httpOnly but misses some vectors |
| **4-5** | Knows httpOnly helps, but vague on why |
| **0-3** | Doesn't understand JWT security |

**Follow-up:**
> If you had to redesign authentication, would you use JWT or server-side sessions? Why?

---

## Question 9.2: Authorization Bypass

**Question:**
> The system uses RBAC (roles) + ABAC (attributes) for authorization. A host tries to edit another host's event. Walk through the authorization check. What would be the bug if it was skipped?

**What we're testing:**
- Do they understand the authorization layers?
- Can they trace the check?
- Can they identify bypass scenarios?

**Model Answer:**

**Authorization Check Flow:**

```typescript
// API endpoint
async function PUT /events/:id {
  const userId = req.user.id;
  const eventId = req.params.id;
  
  // Check authorization
  const canEdit = await PermissionService.can(userId, 'edit', 'event', eventId);
  if (!canEdit) throw new ForbiddenError();
  
  // Safe to proceed
  await updateEvent(eventId, req.body);
}
```

**Inside PermissionService.can():**

```typescript
async can(userId, action, resourceType, resourceId) {
  // Step 1: Check RBAC (role-based)
  const roles = await User.findById(userId).roles;
  
  if (roles.includes('admin')) return true; // Admin can do anything
  
  // Step 2: Check ABAC (attribute-based)
  if (action === 'edit' && resourceType === 'event') {
    const event = await Event.findById(resourceId);
    
    // User can edit only if they own the event
    return event.hostId.equals(userId);
  }
  
  return false; // Default deny
}
```

**If authorization was skipped:**

Host A (id: 111) tries: `PUT /events/456` (owned by Host B, id: 222)

```typescript
// VULNERABLE - No auth check
async function PUT /events/:id {
  const eventId = req.params.id;
  // Just update without checking!
  await updateEvent(eventId, req.body);
}
```

**What breaks:**
- Host A modifies Host B's event
- Event name changed
- Capacity reduced
- Registrations cancelled
- Host B's event ruined

**Is authorization in the code?**

Looking at actual code pattern:
```typescript
// File: src/features/events/updateEvent.ts
export async function updateEvent(eventId, userId, updates) {
  const event = await Event.findById(eventId);
  
  // Is the check here?
  if (event.hostId.toString() !== userId.toString()) {
    throw new ForbiddenError('Not the event host');
  }
  
  await event.updateOne(updates);
}
```

**Scoring Rubric:**

| Score | Criteria |
|-------|----------|
| **10** | Traces authorization flow, shows RBAC + ABAC, explains breach consequences |
| **8-9** | Correct flow, identifies bypass issue |
| **6-7** | Understands check needed, but tracing incomplete |
| **4-5** | Knows authorization matters, vague on how |
| **0-3** | Doesn't understand authorization |

---

# LEVEL 10: PERFORMANCE

## Question 10.1: Query Performance

**Question:**
> The dashboard needs to show "How many guests are registered for this event?" If we queried the registrations table directly (no analytics), what would the query look like? Why is it slow? How slow?

**What we're testing:**
- Do they understand algorithmic complexity?
- Can they reason about query performance?
- Do they know why CDC pre-aggregation matters?

**Model Answer:**

**Direct Query (without analytics):**

```typescript
// SLOW approach
async function getCapacity(eventId) {
  const result = await db.registrations.aggregate([
    {$match: {eventId: ObjectId(eventId), status: 'confirmed'}},
    {$group: {_id: null, count: {$sum: 1}}}
  ]);
  
  return result[0].count;
}
```

**Why it's slow:**

1. **Full collection scan** - Must examine every registration document
   - 1K registrations: O(1ms)
   - 100K registrations: O(100ms)
   - 1M registrations: O(1000ms) ← Unusable

2. **Aggregation pipeline** - CPU cost of grouping
3. **No index benefit** - Index on eventId helps, but must still scan all matching docs

**Complexity analysis:**

Time = O(n) where n = registrations for this event

**With 10K events averaging 100 registrations each:**
- If 100 dashboards open and refresh every 5 seconds
- Total queries/sec = (100 dashboards × 1 query / 5 sec) = 20 queries/sec
- Average query time = 10ms × 100 registrations = 1 second
- Database CPU maxed out

**With analytics (current approach):**

```typescript
// FAST approach  
async function getCapacity(eventId) {
  const result = await db.analytics.findOne({eventId});
  return result.metrics.count;
}
```

**Complexity:** O(1) - Direct lookup by ID

Time = 1-2ms regardless of registration count

**Performance comparison:**

| Dataset | Direct Query | Analytics DB |
|---------|--------------|--------------|
| 1K registrations | 1ms | 1ms |
| 100K registrations | 100ms | 1ms |
| 1M registrations | 1s | 1ms |
| 10M registrations | 10s | 1ms |

**When does it break?**

Direct query becomes unusable when:
- Single event has > 100K registrations
- Multiple concurrent dashboard users
- Query needs < 100ms SLA

**Scoring Rubric:**

| Score | Criteria |
|-------|----------|
| **10** | Shows O(n) vs O(1), explains why, provides scaling numbers |
| **8-9** | Correct complexity analysis, good explanation |
| **6-7** | Understands it's slow, complexity analysis vague |
| **4-5** | Knows aggregation is slow, no analysis |
| **0-3** | Doesn't understand query performance |

---

## Question 10.2: Memory Leak

**Question:**
> The audit stream uses Server-Sent Events to push audit entries to the dashboard. The code stores all entries in component state:
> ```typescript
> const [auditEntries, setAuditEntries] = useState([]);
> 
> eventSource.onmessage = (e) => {
>   setAuditEntries(prev => [newEntry, ...prev]);
> };
> ```
> Is there a bug? If so, what and how do you fix it?

**What we're testing:**
- Do they understand memory issues?
- Can they spot unbounded growth?
- Do they know about limits and cleanup?

**Model Answer:**

**Yes, there's a bug: Unbounded array growth**

**What happens:**

```
Time T=0: 1 entry
Time T=60s: 12 entries (1 per 5 sec)
Time T=1hr: 720 entries
Time T=24hr: 17,280 entries
```

If user leaves dashboard open for days:
- Array grows to 100K+ entries
- Each entry is ~200 bytes of memory
- 100K × 200 bytes = 20MB per user
- 1000 users = 20GB memory
- Browser crashes

**The fix:**

Limit to last N entries:

```typescript
eventSource.onmessage = (e) => {
  setAuditEntries(prev => {
    const updated = [newEntry, ...prev];
    return updated.slice(0, 1000);  // Keep only 1000
  });
};
```

Or use a circular buffer:

```typescript
const BUFFER_SIZE = 1000;
const buffer = useRef([]);

eventSource.onmessage = (e) => {
  if (buffer.current.length >= BUFFER_SIZE) {
    buffer.current = buffer.current.slice(1);  // Remove oldest
  }
  buffer.current.push(newEntry);
  setAuditEntries([...buffer.current]);
};
```

**Better approach: Server-side pagination**

```typescript
// Only send last 50 entries on connect
const recentEntries = await db.audit.find().sort({timestamp: -1}).limit(50);
sendToClient(recentEntries);

// Then stream new entries
onNewEntry(entry => sendToClient(entry));
```

**Cost of each approach:**

| Approach | Memory | CPU | Code |
|----------|--------|-----|------|
| **Unbounded** | O(n) - Grows forever | Low | Simple |
| **Slice after** | O(k) where k=1000 | Medium | Moderate |
| **Circular buffer** | O(k) - Fixed size | Low | Complex |
| **Server-side paginate** | O(k) - Fixed size | Low | Simple |

**Scoring Rubric:**

| Score | Criteria |
|-------|----------|
| **10** | Identifies unbounded growth bug, shows fix with limit, explains memory impact |
| **8-9** | Finds bug, correct fix, reasoning clear |
| **6-7** | Identifies memory issue, fix unclear |
| **4-5** | Knows something's wrong, vague |
| **0-3** | Doesn't see the issue |

---

# LEVEL 11: SCALABILITY

## Question 11.1: 100x Traffic

**Question:**
> Traffic increases 100x (1000 registrations/second instead of 10). The system breaks. Describe:
> - Which component breaks first?
> - Why?
> - How would you fix it?

**What we're testing:**
- Do they understand bottlenecks?
- Can they identify the weakest link?
- Do they know scaling strategies?

**Model Answer:**

**Which breaks first?**

**Atomic reservation lock on single event**

Why:
```
1 event can only handle ~125 registrations/sec (lock serialization)
1000 reg/sec ÷ 125 per event = 8 events needed
If all traffic goes to 1 event, system saturates immediately
```

**Cascade of failures:**

1. **Registration endpoint becomes slow** (T=0)
   - Lock contention increases
   - Response time grows from 10ms to 100ms to 1000ms
   - Users see "loading..."

2. **API queue backs up** (T=10s)
   - Each request waits longer for lock
   - New requests stack up
   - Memory usage grows

3. **Server runs out of memory** (T=30s)
   - Thousands of pending requests
   - Node.js process crashes
   - All users get 500 error

4. **Circuit breaker triggers** (T=35s)
   - Requests fail faster (not getting responses)
   - Email queue backs up (notifications wait)

**How to fix (in priority order):**

**Priority 1: Shard the lock (immediate, < 1 hour)**

Instead of one event-lock, split into 10 shards:
```typescript
const shard = hash(userId) % 10;
const shardedEventId = `${eventId}-shard-${shard}`;

// Each shard handles 125 reg/sec
// 8 shards × 125 = 1000 reg/sec ✓
```

Cost:
- Capacity must sum across 8 shards
- Uneven distribution (some shards fill first)

**Priority 2: Upgrade database hardware** (< 24 hours)
- More CPU for lock management
- More RAM for concurrent sessions
- SSD for faster write

Gain: 2-3x throughput, buys time

**Priority 3: Optimize lock duration** (< 24 hours)
- Split registration into 2 steps:
  1. Reserve seat (fast, lock-free)
  2. Confirm registration (async, no lock)
- Reduces lock time from 10ms to 1ms

**Priority 4: Switch to optimistic locking** (< 1 week)
- Remove locks, use version-based updates
- Retries under contention
- Throughput: 10,000+ reg/sec
- Cost: Complexity, retry logic, fairness issues

**Priority 5: Kafka event streaming** (> 1 week)
- Remove database entirely for capacity checks
- Events streamed through Kafka
- Aggregate capacity independently
- Throughput: Unlimited
- Cost: Major infrastructure change

**Scoring Rubric:**

| Score | Criteria |
|-------|----------|
| **10** | Identifies lock as bottleneck, explains why, provides 3+ fixes with tradeoffs |
| **8-9** | Correct bottleneck, 2+ fixes with reasoning |
| **6-7** | Identifies bottleneck, 1 fix |
| **4-5** | Mentions scaling but vague |
| **0-3** | Doesn't understand bottleneck |

---

## Question 11.2: What Else Breaks?

**Question:**
> At 100x traffic, besides the registration lock, what else breaks? Think about:
> - CDC pipeline
> - Cache layer
> - API rate limiting
> - Database connections
> - External services

**What we're testing:**
- Do they think holistically about systems?
- Can they identify cascade failures?
- Do they understand interconnections?

**Model Answer:**

**At 1000 reg/sec, multiple components fail:**

**1. CDC Pipeline (breaks T=0)**
- Current: Polls every 5 seconds
- At 1000 reg/sec = 5000 changes per 5-second window
- Worker processes 100/sec (max throughput)
- Backlog accumulates: 5000 - 500 = 4500 behind after 5 seconds
- After 1 minute: CDC lag = 5+ minutes
- Dashboard shows ancient data

Fix: Change Stream Listener (real-time) instead of polling

**2. Cache Layer (breaks T=10s)**
- L1 (Redis): Becomes bottleneck
- All 1000 reg/sec query cache first
- Cache hits are good, but cache misses query database
- Redis CPU maxes out
- Requests timeout waiting for cache

Fix: L2 (in-memory) cache becomes primary, reduce Redis queries

**3. Database Connections (breaks T=30s)**
- MongoDB supports ~500 concurrent connections per instance
- At 1000 reg/sec with 50ms transactions = 50 concurrent connections
- Plus CDC worker, background jobs = 75 concurrent
- Connection pool exhausted
- New requests get "connection timeout"

Fix: Add replica (connections scale with instances)

**4. Email Queue (breaks T=60s)**
- Each registration queues email
- At 1000 reg/sec = 1000 emails/sec to queue
- Queue worker sends 100/sec (limited by SMTP rate)
- Queue backs up: 900/sec accumulation
- After 1 minute: Queue has 54,000 pending
- Memory on queue worker grows
- Service crashes

Fix: Add multiple email workers, increase SMTP connection limit

**5. External service (email provider) (breaks T=90s)**
- Evenregman trying to send 1000 emails/sec
- Email provider rate limit: 100/sec
- Sending faster than provider accepts
- Requests rejected with 429 (Too Many Requests)
- Circuit breaker opens after 3 failures
- Stop queuing emails

Fix: Rate limit outgoing email queue to 100/sec

**6. API rate limiting (breaks T=start)**
- If per-IP rate limit exists, might block legitimate users
- 100 users × 10 reg/sec = 1000 reg/sec
- Per-IP limit of 100 req/sec
- Would block users during peak

Fix: Increase rate limit or use different metric (user-based not IP-based)

**7. Audit stream (breaks T=120s)**
- Similar to CDC: 1000 events/sec
- SSE worker can't keep up
- Connections stay open but data backs up
- Browser memory grows

Fix: Limit audit entries sent, add pagination

**Cascade effect:**

```
T=0:   Registration lock slow
T=10s:  CDC lag grows (analytics stale)
T=30s:  Database connections exhausted
T=60s:  Email queue overflows
T=90s:  Email provider rate limited
→ Users can't register (lock stuck)
→ Emails not sent (queue full)
→ Dashboard wrong (CDC behind)
→ System appears broken
```

**Scoring Rubric:**

| Score | Criteria |
|-------|----------|
| **10** | Identifies 4+ components, explains cascade, suggests fixes |
| **8-9** | Identifies 3-4 components with good reasoning |
| **6-7** | Identifies 2-3 components |
| **4-5** | Mentions 1-2 components |
| **0-3** | Only thinks about single component |

---

# LEVEL 12: ARCHITECTURAL REDESIGN

## Question 12.1: Ground-Up Redesign

**Question:**
> Starting from scratch, how would you redesign this system to handle:
> - 100K registrations/second
> - 100+ events with independent capacity limits
> - Guaranteed consistency (no overbooking ever)
> - < 500ms response time for registration
> - Real-time capacity display (< 1 second stale)
> 
> You don't need to match the current tech stack. Describe your approach, tradeoffs, and why.

**What we're testing:**
- Do they understand architectural tradeoffs?
- Can they make principled design decisions?
- Do they know multiple architectural styles?
- Can they defend choices?

**Model Answer:**

**High-level approach:**

Instead of databases for transactional consistency, use event streaming + state snapshots.

**Architecture:**

```
┌─────────────────────────────┐
│ Write Path (Registration)   │
└──────────┬──────────────────┘
           │
      POST /register
           │
      ┌────▼─────┐
      │ Kafka    │  Topics: events-in.100K/sec
      └────┬─────┘
           │
      ┌────▼──────────────────┐
      │ Reservation Service   │
      │ (Stateless)           │
      │ - Check event state   │
      │ - Create reservation  │
      │ - Publish to Kafka    │
      └────┬──────────────────┘
           │
      ┌────▼──────────┐
      │ Kafka Topic   │
      │ "reservations"│
      └────┬──────────┘

┌─────────────────────────────┐
│ Read Path (Dashboard)       │
└──────────┬──────────────────┘
           │
      GET /event/:id/capacity
           │
      ┌────▼──────────────────┐
      │ State Store Service   │
      │ - Redis cluster       │
      │ - Per-event capacity  │
      │ - Updated from Kafka  │
      └────┬──────────────────┘
           │
      Response: Capacity in 1ms
```

**Components:**

1. **Kafka** (Write input)
   - Throughput: 100K+ msg/sec
   - Durability: Persists all events
   - Ordering: Per-partition (per-event ordering)

2. **Reservation Service** (Stateless workers)
   - Read event capacity from Redis
   - Publish event: "ReservationAttempted"
   - Response immediately (async)
   - No database lock needed

3. **Capacity Computer** (Background)
   - Consumes reservation events
   - Maintains event capacity state
   - Updates Redis (< 1 second)
   - Updates analytics

4. **Redis Cluster** (State store)
   - Current capacity per event
   - < 1ms lookups
   - Auto-replicating
   - Survives restarts (persistence on)

5. **Cassandra** (Event log)
   - Append-only, distributed
   - Handles 100K+ writes/sec
   - No transactions needed
   - Geo-distributed possible

**Why this works:**

| Requirement | How Solved |
|-----------|-----------|
| **100K reg/sec** | Kafka throughput, stateless services |
| **Consistency** | Events immutable, computed state idempotent |
| **< 500ms response** | Async confirmation, no writes on critical path |
| **< 1s stale** | Background updating Redis |
| **Scale 100 events** | Partition-per-event (auto-scaling) |

**Tradeoffs:**

Gain:
- Unlimited throughput (add services linearly)
- True consistency (events are source of truth)
- Easy auditing (full event log)
- Can replay/debug

Lose:
- Complexity (4+ services)
- Operational overhead (Kafka, Redis, Cassandra)
- Debugging harder (distributed system)
- Cost (more infrastructure)

**Alternative: SQLite + Replication**

(Simpler but less scalable)

```
Primary: SQLite (single writer)
├─ Fast, simple, ACID
├─ Throughput limit: ~1000 writes/sec

Replicas: Read-only copies
├─ Handle dashboard reads
├─ Some consistency lag (async replication)
```

Cost:
- Simpler to operate
- Still limited by single writer
- Good for < 10K reg/sec

**Alternative: In-Memory State + Audit Log**

(Even simpler, but risky)

```
In-memory state:
├─ Events capacity in RAM
├─ Super fast reads/writes
├─ Loss on crash (unless persistence)

Audit log in database:
├─ Replay to recover state
├─ But recovery takes time
```

Cost:
- Simplest
- Must have recovery plan
- Single machine limit

**My recommendation:**

For 100K reg/sec:
1. **Start with:** Kafka + Redis + Node services (6 month timeline)
2. **Avoid:** Relational database (throughput limit)
3. **Avoid:** In-memory only (no durability)

The Kafka + Redis combo balances:
- Operational complexity (moderate)
- Scalability (near-unlimited)
- Cost (moderate)

**Scoring Rubric:**

| Score | Criteria |
|-------|----------|
| **10** | Proposes architecture, explains tradeoffs, compares alternatives, defends choice |
| **8-9** | Good architecture, most tradeoffs covered |
| **6-7** | Reasonable approach, limited tradeoff analysis |
| **4-5** | Vague on implementation |
| **0-3** | No architectural thinking |

---

## Question 12.2: Fallback Design

**Question:**
> What if you had ONLY 1 engineer and 1 week to rebuild? You can use exactly 3 technologies (pick any stack). Requirements same: 100K reg/sec, guaranteed consistency, < 1s stale. What's your minimum viable architecture?

**What we're testing:**
- Can they simplify without losing critical requirements?
- Do they understand core vs. nice-to-have?
- Can they prioritize ruthlessly?

**Model Answer:**

**Constraints:**
- 1 engineer
- 1 week
- 3 technologies only
- 100K reg/sec
- No overbooking
- < 1s stale

**Minimum viable stack:**

1. **PostgreSQL** (Persistence + transactions)
2. **Redis** (Cache + Pub/Sub)
3. **Node.js** (Application logic)

**Architecture:**

```
POST /register
  ↓
[Validation]
  ↓
[Reserve in PostgreSQL]
  ├─ Use advisory locks (per-event)
  ├─ Check capacity
  ├─ Insert reservation
  ├─ Publish to Redis Pub/Sub
  ↓
[Cache invalidate]
  ├─ Redis: delete event:123:capacity
  ↓
Response: {status: confirmed}


GET /event/:id/capacity
  ↓
[Check Redis cache]
  ├─ Hit: return immediately (1ms)
  ├─ Miss: query PostgreSQL
  │   ├─ SELECT SUM(seats) FROM registrations WHERE eventId=?
  │   ├─ Store in Redis TTL 1s
  │   └─ Return
  ↓
Response: {capacity: 45}
```

**Why this works:**

| Requirement | Solution |
|-----------|----------|
| **Consistency** | PostgreSQL transactions (ACID) |
| **100K reg/sec** | Redis Pub/Sub + connection pooling |
| **< 1s stale** | Redis cache with 1s TTL |
| **Predictable** | No distributed system complexity |

**Throughput analysis:**

PostgreSQL can handle:
- 1000-5000 transactions/sec on modest hardware
- Advisory locks per-event distribute load
- If 100 events: 5000 ÷ 100 = 50 trans/sec per event ← NOT ENOUGH

**Fix: Pre-Assign Capacity**

Instead of checking capacity per-request:

```
At event creation:
  ├─ Create 100 "seat" rows (event_123_seat_001, etc)
  ├─ status = "available"
  
On registration:
  ├─ UPDATE seats SET status='assigned', user_id=? WHERE status='available' LIMIT 1
  ├─ Fast: 1 row update, no lock needed
  ├─ Throughput: 10,000+ reg/sec per event
  ├─ Publish event to Redis
  
On dashboard:
  ├─ SELECT COUNT(*) FROM seats WHERE status='assigned'
  ├─ Cache with 1s TTL
```

**Timeline (1 week):**

- Day 1-2: Schema + basic API (registration endpoint, capacity endpoint)
- Day 3-4: Caching layer (Redis) + invalidation
- Day 5: Pub/Sub for real-time updates
- Day 6: Testing + optimization
- Day 7: Deployment + ops docs

**Tradeoffs:**

Gain:
- Works within 1 week
- Understandable by solo engineer
- Only 3 services (operationally simple)
- 100K+ throughput possible with optimization

Lose:
- Still need PostgreSQL tuning (not trivial)
- Capacity pre-allocation different UX
- No easy geographic replication
- Single PostgreSQL instance bottleneck at 10K req/sec

**Would not include:**
- Kafka (too complex for 1 week + 1 engineer)
- Cassandra (learning curve too steep)
- Complex CDC (too much infrastructure)

**Scoring Rubric:**

| Score | Criteria |
|-------|----------|
| **10** | Realistic 1-week design, explains tradeoffs, justifies tech choices |
| **8-9** | Solid approach, timeline credible |
| **6-7** | Reasonable but timeline unclear or misses a requirement |
| **4-5** | Vague on feasibility |
| **0-3** | Unrealistic proposal |

---

# MASTER SCORING SUMMARY

## How to Evaluate

After all 12 levels (24 questions), calculate overall understanding:

```
Total Score = (Sum of all individual scores) / 24

0-2: Novice (recently started learning this codebase)
3-4: Intermediate (understands core concepts)
5-6: Proficient (could contribute to the codebase)
7-8: Advanced (could lead architecture discussions)
9-10: Expert (deep system understanding)
```

## What Each Level Tests

| Level | Focus | Questions | Key Indicator |
|-------|-------|-----------|---------------|
| 1 | Repository structure | 1.1, 1.2, 1.3 | Can navigate codebase |
| 2 | Components | 2.1, 2.2 | Understands why components exist |
| 3 | Data flow | 3.1, 3.2 | Can trace data transformations |
| 4 | Runtime behavior | 4.1, 4.2 | Understands concurrency, async |
| 5 | Design patterns | 5.1, 5.2 | Recognizes patterns, knows benefits |
| 6 | Architecture decisions | 6.1, 6.2 | Understands tradeoffs |
| 7 | Tradeoffs | 7.1, 7.2 | Can redesign for constraints |
| 8 | Failure modes | 8.1, 8.2 | Understands consequences |
| 9 | Security | 9.1, 9.2 | Identifies vulnerabilities |
| 10 | Performance | 10.1, 10.2 | Understands bottlenecks |
| 11 | Scalability | 11.1, 11.2 | Thinks holistically about limits |
| 12 | Redesign | 12.1, 12.2 | Can architect from first principles |

---

# How to Use This Examination Guide

1. **Ask questions in sequence** (Level 1 → 12)
2. **After each answer**, score 0-10 using the rubric
3. **If score < 6**, ask follow-up or explain concept before moving on
4. **If score >= 8**, move to next question
5. **Track progression** (watch for where understanding breaks)
6. **Final assessment** - Calculate overall score and learning plan

---

**This examination system comprehensively validates understanding of:**
- Codebase organization and navigation
- Architectural decisions and tradeoffs
- Runtime behavior and concurrency
- Performance and scalability analysis
- Security implications
- Failure modes and recovery
- Full-stack system design

A candidate scoring 8+ across all levels demonstrates **senior-engineer level understanding** of the Evenregman architecture.
