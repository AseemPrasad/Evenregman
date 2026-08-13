# Evenregman - Architectural Decision Analysis

Senior architect's deep analysis of WHY THIS? and WHY NOT THAT? for every major decision.

---

## Table of Contents

1. [MongoDB as Primary Database](#mongodb-primary-database)
2. [Monolithic Backend + Workers](#monolithic-backend)
3. [Transaction-Based Atomicity](#transaction-based-atomicity)
4. [CDC for Analytics](#cdc-analytics)
5. [Multi-Layer Caching](#multi-layer-caching)
6. [JWT + OAuth Authentication](#jwt-oauth)
7. [RBAC + ABAC Authorization](#rbac-abac)
8. [Outbox Pattern](#outbox-pattern)
9. [Job Queue for Async](#job-queue-async)
10. [SSE for Real-Time](#sse-realtime)
11. [React Query State Management](#react-query-state)
12. [Separate Analytics Database](#separate-analytics-db)
13. [Audit Logging](#audit-logging)
14. [Circuit Breaker](#circuit-breaker)
15. [Layered Architecture](#layered-architecture)

---

# DECISION 1: MongoDB as Primary Database

## What it currently does

All operational data stored in MongoDB:
- Events, registrations, users, audit logs
- Transactions supported (requires replica set)
- Change streams available (for CDC)
- Flexible schema (easy schema evolution)

**Where implemented**:
- `src/models/` - All MongoDB models
- `src/lib/db.ts` - Database connection
- MongoDB connection string in `.env`

---

## WHY THIS? (MongoDB)

### Problem it solves

Need a database that:
1. Supports transactions (atomic registrations)
2. Provides change streams (CDC pipeline)
3. Flexible schema (event fields change)
4. Good Node.js integration

### Engineering principles

**Pragmatism over purism**: 
- Not trying to build perfect relational database
- Event management has nested data (event → registrations → audit)
- Document model matches domain model

**Developer experience**:
- Schema mirrors code (JavaScript object = JSON document)
- No ORM impedance mismatch
- Native async/await with Mongoose

### Evidence supporting it

**File**: `src/models/Event.ts`
```typescript
const eventSchema = new Schema({
  name: String,
  description: String,
  registrations: [{ type: ObjectId, ref: 'Registration' }], // Nested relationship
  // MongoDB naturally handles this nested structure
});
```

**File**: `src/lib/db.ts`
```typescript
// Uses Mongoose (Node.js MongoDB driver)
const connection = await mongoose.connect(process.env.MONGODB_URI);
```

**File**: `src/lib/atomic-reservation.ts`
```typescript
const session = await mongoose.startSession();
session.startTransaction(); // Transactions! (not available in older versions)
```

**File**: `src/workers/cdc-worker.ts`
```typescript
const changeStream = db.collection('registrations').watch(); // Change streams
changeStream.on('change', (change) => {...});
```

---

## WHY NOT THAT? (Realistic Alternatives)

### Alternative 1: PostgreSQL (Relational)

**How it would work**:
```sql
CREATE TABLE events (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255),
  host_id BIGINT REFERENCES users(id),
  total_capacity INT,
  registered_count INT,
  ...
);

CREATE TABLE registrations (
  id BIGSERIAL PRIMARY KEY,
  event_id BIGINT REFERENCES events(id),
  user_id BIGINT REFERENCES users(id),
  seats_requested INT,
  status VARCHAR(50),
  ...
);
```

**Advantages**:
- Mature technology (proven at scale)
- Strong consistency (ACID transactions)
- SQL standardized (developers know it)
- Excellent indexing strategies
- Foreign key constraints enforced
- EXPLAIN ANALYZE for query optimization

**Disadvantages**:
- No change streams (would need Logical Decoding or Debezium)
- Schema changes more painful (migrations required)
- ORM overhead (Sequelize, TypeORM add complexity)
- Normalization can mean more joins

**Complexity**: Medium-High
- Need migration system
- Need ORM or raw SQL
- Need separate CDC tool

**Performance**: 
- Better for complex queries (JOINs optimized)
- Worse for nested data (multiple round trips)

**Scalability**:
- Horizontal: Difficult (requires read replicas + sharding complexity)
- Vertical: Excellent (PostgreSQL scales huge)

**Maintainability**:
- Schema changes require downtime
- Migrations add operational burden
- SQL easier for analysts

**Testability**: Good (can use SQLite for tests)

**Operational consequences**:
- Need PostgreSQL cluster setup
- WAL archival for backups
- Streaming replication for high availability

**Evidence PostgreSQL was considered**:
- Not found in codebase (made MongoDB choice)

---

### Alternative 2: DynamoDB (Serverless NoSQL)

**How it would work**:
```typescript
const params = {
  TableName: 'events',
  Key: { eventId: event_id },
  Item: { name, capacity, registeredCount, ... }
};
await dynamodb.putItem(params).promise();
```

**Advantages**:
- Serverless (no ops team needed)
- Automatic scaling (handles spikes)
- Pay per request (cheap for variable load)
- Global tables (multi-region built-in)

**Disadvantages**:
- Limited transaction support (only cross-partition works in batches)
- No change streams (need DynamoDB Streams + Lambda)
- Query flexibility limited (must plan for access patterns upfront)
- Costs predictability poor (can spike)
- No JOINs (must denormalize)

**Complexity**: High
- Must design queries before building
- Limited query flexibility
- Separate DynamoDB Streams system needed

**Performance**:
- Great for individual lookups (single item gets)
- Poor for complex queries (no flexible filtering)
- Eventual consistency (not strong by default)

**Scalability**:
- Automatic horizontal (built-in)
- Expensive at large scale (per-request billing)

**Maintainability**:
- Query patterns lock you in
- Hard to change access patterns
- Costs can spiral unexpectedly

**Testability**: Poor (no local DynamoDB for easy testing)

**Operational consequences**:
- AWS vendor lock-in
- Harder to predict costs
- Less control over performance

**Why not DynamoDB**:
- Transactions important (seats must be atomic)
- Complex queries needed (capacity checks, waitlist queries)
- Not serverless budget (self-hosted likely cheaper)

---

### Alternative 3: Graph Database (Neo4j)

**How it would work**:
```cypher
CREATE (event:Event {name: 'Tech Meetup', capacity: 50})
CREATE (user:User {email: 'host@example.com'})
CREATE (user)-[:HOSTS]->(event)
CREATE (guest:User {email: 'guest@example.com'})
CREATE (guest)-[:REGISTERED_FOR {seats: 2}]->(event)
```

**Advantages**:
- Excellent for relationships (who registered for what?)
- Query performance for traversals (depth doesn't matter)
- Natural domain modeling (event → people → connections)

**Disadvantages**:
- Overkill for this domain (not graph-heavy)
- Smaller ecosystem (fewer tools)
- Harder to operate (licensing, support)
- Transactions limited
- No change streams

**Why not Neo4j**:
- Domain isn't graph-heavy (main queries are: event → registrations, not deep traversals)
- Operational complexity (another database to run)
- Cost (premium pricing)

---

## TRADEOFF

### What MongoDB gains
✓ Native transactions (atomic registrations guaranteed)  
✓ Change streams (CDC pipeline built-in)  
✓ Flexible schema (easy to add fields)  
✓ Good Node.js integration (Mongoose)  
✓ Document model matches domain  

### What MongoDB sacrifices
✗ Enforced referential integrity (no foreign keys)  
✗ Query flexibility (limited to indexed access patterns)  
✗ Ecosystem size (fewer tools than SQL)  
✗ Operational maturity (PostgreSQL more battle-tested)  
✗ Transaction performance (slower than SQL)  

---

## FAILURE POINT

MongoDB becomes problematic when:

1. **Need complex analytics queries** (many JOINs needed)
   - Current: Separate analytics DB (via CDC) solves this
   - But: if analytics queries need to combine multiple collections, painful

2. **Schema changes on large data** (adding indexed field to 100M docs)
   - Current: Can add field (nullable), but index build blocks
   - Workaround: Background index building available

3. **Consistency issues** (eventual consistency if replica lag)
   - Current: Uses transactions (strong consistency)
   - But: if replica set misconfigured, could see stale reads

4. **Operator errors** (accidentally deleting collection)
   - Current: No foreign key constraints prevent orphaned data
   - Workaround: Validation layer in application code

---

## CHANGE CONDITION

Replace MongoDB if:

1. **Need strong schema enforcement**
   - Requirement: Must prevent invalid data (regulatory)
   - Solution: Add application-level validation (current approach)

2. **Need complex relational queries**
   - Requirement: Analytics queries need many JOINs
   - Solution: Materialized views (current CDC approach)
   - If this becomes too expensive: Switch to PostgreSQL for analytics, keep MongoDB for operational

3. **Transaction performance critical**
   - Requirement: > 10,000 transactions/second
   - Solution: Move to PostgreSQL or distributed system

4. **Multi-region needed**
   - Requirement: Global data consistency
   - Solution: MongoDB Atlas (managed MongoDB with multi-region)
   - If not sufficient: Consider DynamoDB or Spanner

---

## SCALE CONDITION

MongoDB stops being appropriate at:

**Concurrent registrations**: ~10,000/second per replica set
- Reason: Lock contention on single event
- Solution: Shard by event
- Beyond: Need distributed transaction coordinator

**Dataset size**: ~1TB per collection
- Reason: Backups, maintenance operations slow
- Solution: Archive old data, sharding
- Beyond: Need data warehouse (analytics separate anyway)

**Query latency**: If <100ms requirement
- Reason: Network round trips add ~5-10ms
- Solution: Better indexing, read replicas
- Beyond: Need in-memory cache (already using)

**Operational team size**: If need to reduce ops
- Reason: MongoDB requires cluster management
- Solution: MongoDB Atlas (managed)
- Beyond: Completely serverless (DynamoDB)

---

## LEARNING QUESTION

**Question**: 
> "This repository uses MongoDB for transactions (atomic reservations). Explain why MongoDB transactions are sufficient here but would be problematic if the system needed to atomically update registrations AND send email notifications in a single transaction."

**What this tests**:
- Do you understand MongoDB transaction scope?
- Do you know transactions can't call external services?
- Do you understand the Outbox pattern exists to solve this?
- Can you reason about consistency guarantees?

**Answer key**:
Database transactions can only include database operations. If we wanted "register AND send email atomically", we'd need either:
1. Email service as part of database (impossible)
2. Outbox pattern (current approach - queue email after DB commit)
3. Saga pattern (distributed transactions across services)
4. Accept eventual consistency (email might fail after registration succeeds)

MongoDB transactions guarantee database consistency, but not application-level consistency across services.

---

# DECISION 2: Monolithic Backend + Worker Processes

## What it currently does

Single Next.js API serving all requests:
- Registration endpoint
- Event CRUD endpoints
- Auth endpoints
- Real-time SSE endpoints

Separate worker processes:
- CDC worker (change stream listener)
- CSV export worker
- Notification worker
- Job queue coordinator

**Where implemented**:
- API: `src/app/api/`
- Workers: `src/workers/`

---

## WHY THIS? (Monolithic + Workers)

### Problem it solves

1. **Simplicity**: Single codebase, single deployment
2. **Request/response latency**: API responds immediately (doesn't wait for async)
3. **Long-running tasks**: Workers handle without blocking API
4. **Separation of concerns**: API handles requests, workers handle events

### Engineering principles

**Separation of concerns**:
- Synchronous work (API) separated from asynchronous work (workers)
- API responds quickly (important for user experience)
- Workers process at their own pace (important for reliability)

**Pragmatic complexity**:
- Not trying to build full microservices (would be overkill)
- But still separating concerns (workers are technically separate services)
- Single shared database (simpler than service-oriented architecture)

### Evidence supporting it

**File**: `src/app/api/registrations/route.ts`
```typescript
export async function POST(req: Request) {
  // Register guest
  const result = await atomicReservation(...);
  
  // Queue email (doesn't wait)
  await queue.enqueue({type: 'email_confirmation', ...});
  
  // Return immediately
  return Response.json(result); // User gets response before email sent
}
```

**File**: `src/workers/cdc-worker.ts`
```typescript
// Runs independently, polls every 5 seconds
setInterval(async () => {
  const changes = await getChangesFromOplog();
  await projectToAnalytics(changes);
}, 5000);
```

**File**: `src/workers/csv-export.ts`
```typescript
// Long-running process (doesn't block API)
async function exportRegistrations(jobId) {
  const registrations = await Registration.find({});
  const csv = formatAsCSV(registrations);
  await uploadToStorage(csv); // Takes minutes if needed
  // API never had to wait
}
```

---

## WHY NOT THAT? (Realistic Alternatives)

### Alternative 1: Pure Microservices

**How it would work**:
```
Client → API Gateway
         ├─→ Registration Service
         ├─→ Event Service
         ├─→ Auth Service
         ├─→ Analytics Service
         └─→ Export Service

Each with separate database + deployment
```

**Advantages**:
- Independent scaling (scale Registration Service during registration spike)
- Independent deployment (update Auth without deploying everything)
- Clear boundaries (forces good design)
- Technology diversity (Auth Service could be Go, Export could be Python)
- Team scaling (teams own services)

**Disadvantages**:
- Distributed tracing complexity (which service is slow?)
- Data consistency nightmares (transactions span multiple databases)
- Testing complexity (integration tests span multiple services)
- Network latency (inter-service calls add milliseconds)
- Operational overhead (need service mesh, monitoring for each)
- API Gateway complexity (routing, versioning, rate limiting)

**Complexity**: Very High
- Need to define service boundaries (easy to get wrong)
- Need inter-service communication protocol (REST, gRPC, etc)
- Need centralized logging/tracing
- Need service discovery

**Performance**:
- Per-request latency: Worse (extra network hops)
- Throughput: Better (if services scale independently)
- Cold starts: Worse (more services to start)

**Scalability**:
- Excellent horizontal (each service scales independently)
- But: Need careful load balancing

**Maintainability**:
- Better: Clear boundaries
- Worse: Cross-service debugging hard

**Testability**:
- Worse: Integration tests harder
- Better: Unit tests simpler (single service)

**Operational consequences**:
- Need service mesh (Istio, Linkerd)
- Need distributed tracing (Jaeger, Zipkin)
- Need service registry (Consul, Eureka)
- Multiple deployment pipelines

**Why not microservices**:
- Current scale doesn't justify operational complexity
- Shared database needed (for transactions)
- Team too small to own multiple services
- Would add 50-100ms per request (extra hops)

---

### Alternative 2: Monolithic with Embedded Workers

**How it would work**:
```typescript
// Everything in one process
const app = express();

app.post('/api/registrations', async (req, res) => {
  // Handle registration
  const registration = await createRegistration(...);
  // Email sent synchronously
  await sendEmail(registration);
  res.json(registration);
});

// Workers run in same process
startCDCWorker();
startExportWorker();
startNotificationWorker();
```

**Advantages**:
- Single deployment (monolithic)
- Simpler configuration
- Easier local development (run one process)

**Disadvantages**:
- Long-running tasks block new requests (email send blocks API)
- Memory leak potential (workers accumulate state)
- Can't restart workers without restarting API
- Debugging harder (mixed concerns in one process)
- Scaling problematic (can't scale workers independently)

**Why current is better**:
- API responds immediately (users don't wait for email)
- Workers can restart independently
- Workers can be scaled on different machines
- Better separation of concerns

---

### Alternative 3: Serverless Functions (AWS Lambda)

**How it would work**:
```typescript
// Each operation is a Lambda function
exports.registerGuest = async (event) => {
  const registration = await createRegistration(...);
  // Email queued to SNS/SQS
  await sns.publish({...});
  return {statusCode: 200, body: JSON.stringify(registration)};
};

// Workers as separate Lambda functions
exports.cdcWorker = async () => {
  const changes = await getChanges();
  await projectToAnalytics(changes);
};

// Triggered by EventBridge every 5 minutes
```

**Advantages**:
- Automatic scaling (AWS handles)
- Pay only for execution (no idle servers)
- Simple ops (AWS manages infrastructure)
- Good for bursty load

**Disadvantages**:
- Cold start latency (first request slow)
- Vendor lock-in (AWS)
- Distributed environment harder to debug
- Cost unpredictability (can spike)
- Event-driven requires careful design

**Performance**:
- First invocation: 1000ms+ (cold start)
- Subsequent: 10-100ms (warm)
- Not suitable for consistent latency requirements

**Cost**:
- Cheap for low volume
- Expensive at scale (request-based pricing)

**Why not Lambda**:
- Consistent latency important (API Gateway calls)
- Need to avoid cold starts
- Cost would be higher (1000s registrations/day)

---

## TRADEOFF

### What monolithic + workers gains
✓ Simple deployment (one service)  
✓ API latency low (returns immediately)  
✓ Shared database (strong consistency)  
✓ Easy development (single codebase)  
✓ Lower operational overhead  

### What it sacrifices
✗ Independent scaling (all services scale together)  
✗ Independent deployment (deploy everything or nothing)  
✗ Separation of teams (can't easily own separate services)  
✗ Technology diversity (stuck with Node.js)  
✗ Fault isolation (if API crashes, workers might too)  

---

## FAILURE POINT

Monolithic + workers becomes problematic when:

1. **Registration storm** (10,000 registrations/second for single event)
   - Current: Single event is serialized by lock
   - Problem: API gets slow for other endpoints
   - Workaround: Load balance events to separate replicas

2. **Worker backlog** (CDC can't keep up with changes)
   - Current: Dashboard sees stale data until CDC catches up
   - Problem: Capacity numbers wrong for brief period
   - Workaround: Add more CDC workers (scale horizontally)

3. **API crash** (registration handler throws error)
   - Current: Workers continue (if separate process)
   - Problem: If same process, workers might crash too
   - Solution: Use separate worker processes (current approach)

4. **Tight coupling** (change one endpoint, breaks workers)
   - Current: Workers access database directly
   - Problem: No versioning/contracts
   - Solution: Add integration tests between API and workers

---

## CHANGE CONDITION

Migrate to microservices if:

1. **Independent scaling needed**
   - Requirement: Registration scaling separate from export
   - Solution: Separate Registration and Export services
   - Trigger: Export taking down API performance

2. **Different tech stacks needed**
   - Requirement: CSV export in Python (pandas)
   - Solution: Export microservice in Python
   - Trigger: Performance needs demand different language

3. **Team grows** (>20 engineers)
   - Requirement: Multiple teams owning different services
   - Solution: Team-owned microservices
   - Trigger: Git conflicts, deployment contention

4. **Multi-tenant** (different customers)
   - Requirement: Tenant isolation
   - Solution: Customer-specific services or data partitioning
   - Trigger: Regulatory requirements for data separation

---

## SCALE CONDITION

Monolithic stops being appropriate at:

**Deployments**: > 10 per day
- Current: Monolithic works fine
- Problem: Each deploy touches everything
- Solution: Feature flags or microservices
- Beyond: Need independent deployment cycles

**Request rate**: > 100,000/second
- Current: Single API can handle
- Problem: Load balancing hard across regions
- Solution: Regional deployments, CDN
- Beyond: Need microservices per region

**Data size**: > 10TB
- Current: MongoDB replica set works
- Problem: Backups take hours, PITR limited
- Solution: Sharding or archival strategy
- Beyond: Need data warehouse

**Code size**: > 1M lines
- Current: Single repo is fine
- Problem: Checkout, build times slow
- Solution: Monorepo with workspaces
- Beyond: Multiple repos (microservices)

---

## LEARNING QUESTION

**Question**:
> "Why does the current architecture queue email notifications instead of sending them synchronously in the registration endpoint? What would break if email was sent within the registration transaction?"

**What this tests**:
- Do you understand API latency vs reliability tradeoff?
- Do you know email is external service (can fail)?
- Do you understand transactions can't span external services?
- Do you know about queuing patterns?

**Answer key**:
If email was sent synchronously within registration:
1. User waits for email send (adds 100-500ms)
2. If email service down, registration fails (wrong behavior)
3. Retry logic complicates code (exponential backoff needed)
4. API becomes dependent on email service availability (low availability)

Current approach:
- Registration succeeds independently
- Email sent asynchronously
- If email fails, user is still registered (can retry email)
- Email service outage doesn't affect registrations

This is application of separation of concerns: registration is important (must succeed), email is not (can retry).

---

# DECISION 3: Transaction-Based Atomicity (Not Event Sourcing)

## What it currently does

Uses MongoDB sessions for ACID transactions:
1. Start transaction on event
2. Read capacity, check availability
3. Create registration or add to waitlist
4. Update event counters
5. Commit or rollback as atomic unit

**Where implemented**:
- `src/lib/atomic-reservation.ts`

---

## WHY THIS? (Transactions)

### Problem it solves

Prevent overbooking when concurrent registrations happen.

Without transactions:
```
Thread A: Check capacity → YES
Thread B: Check capacity → YES
Thread A: Create registration, update counter
Thread B: Create registration, update counter → OVERBOOKING!
```

With transactions:
```
Thread A: Lock acquired → Read capacity → Create & update → Commit → Lock released
Thread B: WAIT for lock → Read capacity (updated) → WAITLIST → Commit
```

### Engineering principles

**Immediate consistency**:
- After response sent, system is in consistent state
- No "eventually consistent" confusion

**Simplicity**:
- Database handles locking, rollback
- No retry logic needed in application
- Easier to reason about

### Evidence supporting it

**File**: `src/lib/atomic-reservation.ts`
```typescript
async function atomicReservation(eventId, seats, userId) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // All operations here are atomic
    const event = await Event.findById(eventId, null, {session});
    if (event.registeredCount + seats <= event.totalCapacity) {
      const registration = await Registration.create([{...}], {session});
      event.registeredCount += seats;
      await event.save({session});
    } else {
      // Waitlist
    }
    
    // All succeed or all fail
    await session.commitTransaction();
    return {status: 'confirmed'};
  } catch (error) {
    await session.abortTransaction();
    throw error;
  }
}
```

---

## WHY NOT THAT? (Realistic Alternatives)

### Alternative 1: Event Sourcing

**How it would work**:
```typescript
// Don't update state, store immutable events
await EventLog.insertOne({
  type: 'RegistrationAttempted',
  eventId, userId, seatsRequested,
  timestamp: Date.now()
});

// Compute current state by replaying events
const registrations = await EventLog.aggregate([
  {$match: {eventId, type: 'RegistrationConfirmed'}},
  {$group: {_id: null, total: {$sum: '$seatsRequested'}}}
]);

if (registrations[0].total + seatsRequested <= capacity) {
  await EventLog.insertOne({
    type: 'RegistrationConfirmed',
    ...
  });
} else {
  await EventLog.insertOne({
    type: 'RegistrationWaitlisted',
    ...
  });
}
```

**Advantages**:
- Complete audit trail (every event recorded)
- Can replay events to any point in time
- Good for debugging ("what state were we in at 3pm?")
- Natural fit for CQRS (Command Query Responsibility Segregation)
- Supports complex workflows (sagas)

**Disadvantages**:
- Query complexity (must sum/replay events)
- Storage bloat (keeps all history)
- Latency (aggregation needed for every query)
- Learning curve (different paradigm)
- No strong consistency (eventual consistency only)

**Performance**:
- Writes: Good (insert only)
- Reads: Bad (must aggregate)
- Capacity check: O(n) (sum registrations)

**Complexity**: Very High
- Need event store
- Need projections (materialized views)
- Need event handler registration
- Sagas for distributed transactions

**Why current is better**:
- Capacity check needs O(1) (immediate response)
- Event sourcing makes this O(n)
- Tradeoff not worth complexity gain

---

### Alternative 2: Optimistic Locking with Retries

**How it would work**:
```typescript
async function optimisticReserve(eventId, seats, userId, retries = 3) {
  while (retries > 0) {
    const event = await Event.findById(eventId);
    const version = event.version; // Track version
    
    if (event.registeredCount + seats <= event.totalCapacity) {
      // Try to update only if version matches
      const result = await Event.updateOne(
        {_id: eventId, version: version},
        {
          $inc: {registeredCount: seats, version: 1},
          $push: {registrations: registrationId}
        }
      );
      
      if (result.modifiedCount === 1) {
        // Success
        return {status: 'confirmed'};
      } else {
        // Version mismatch, retry
        retries--;
        await delay(Math.random() * 100); // Exponential backoff
      }
    } else {
      // Waitlist (doesn't need retry)
      await Registration.create({status: 'waitlisted'});
      return {status: 'waitlisted'};
    }
  }
  
  throw new Error('Registration failed after retries');
}
```

**Advantages**:
- No locks (higher concurrency)
- Simpler database (no transaction support needed)
- Works across network (distributed systems)
- Can tune retry strategy

**Disadvantages**:
- Retry logic complex (backoff, jitter needed)
- Unfair (last writer can keep winning)
- Timeout handling unclear
- Testing retry cases hard
- May need multiple retries under load

**Performance**:
- Best case: No wait (first try succeeds)
- Worst case: Multiple retries (adds 100-500ms)
- Contention-dependent

**Fairness**: Bad
- Fast threads can repeatedly win
- Slow threads starved

**Why current is better**:
- Transactions handle all cases uniformly
- No retry logic needed
- Fair (FIFO queue)
- Simpler to reason about

---

### Alternative 3: Distributed Lock (Redis)

**How it would work**:
```typescript
async function redisLockReserve(eventId, seats, userId) {
  const lockKey = `event:${eventId}:lock`;
  const lockValue = uuid();
  
  // Try to acquire lock (5 second TTL)
  const acquired = await redis.set(
    lockKey,
    lockValue,
    'NX', // Only if not exists
    'EX', // Expire after
    5
  );
  
  if (!acquired) {
    // Someone else holds lock
    return {error: 'locked', retry: true};
  }
  
  try {
    const event = await Event.findById(eventId);
    if (event.registeredCount + seats <= event.totalCapacity) {
      const registration = await Registration.create({...});
      event.registeredCount += seats;
      await event.save();
      return {status: 'confirmed'};
    } else {
      return {status: 'waitlisted'};
    }
  } finally {
    // Delete lock (using script to prevent accidental deletion of other locks)
    await redis.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
      1, lockKey, lockValue
    );
  }
}
```

**Advantages**:
- Works across services (Redis shared)
- No database transaction needed
- Flexible timeout (TTL)
- Can implement queuing (BLPOP to wait for lock)

**Disadvantages**:
- Requires Redis (extra infrastructure)
- Lock loss on crash (TTL expires)
- Network latency (Redis round trip ~5-10ms)
- Complex to debug (lock state not visible)
- Lock expiration can be wrong

**Operational consequences**:
- Need Redis cluster (if high availability)
- Need monitoring for lock contention
- Hard to debug (what's holding lock?)

**Why current is better**:
- Transactions integrated with database
- No separate Redis needed for locks (already using for cache)
- Better failure semantics (auto-rollback)
- Simpler to debug (logs show transaction state)

---

## TRADEOFF

### What transactions gain
✓ Strong consistency (either all changes or none)  
✓ Serialization (fair ordering)  
✓ Simple application code (no retries)  
✓ Easy to debug (transaction logs)  
✓ No lock loss (database manages locks)  

### What they sacrifice
✗ Concurrency (serialized access)  
✗ Latency (lock wait time adds milliseconds)  
✗ Throughput (one event at a time)  
✗ Flexibility (lock must be released)  
✗ Requires replicated database (MongoDB replica set needed)  

---

## FAILURE POINT

Transactions become problematic when:

1. **Very high contention** (10,000 registrations/second for single event)
   - Current: Lock queue backs up
   - Problem: Timeouts possible, users see errors
   - Workaround: Distribute across shards

2. **Need distributed transactions** (registration + external payment)
   - Current: Transaction stops at database
   - Problem: Payment can fail after registration succeeds
   - Workaround: Saga pattern (not transactions)

3. **Long-running registration** (somehow takes 5 minutes)
   - Current: Lock held for 5 minutes
   - Problem: Others blocked, timeouts
   - Workaround: Split into smaller transactions

4. **Transaction abort due to replica failover**
   - Current: Transaction fails, retry needed
   - Problem: Worse under load (many failures)
   - Workaround: Retry logic in application

---

## CHANGE CONDITION

Use event sourcing instead if:

1. **Need complete audit trail**
   - Current: Audit table records events
   - But: Can't replay registrations to past state
   - If needed: Add event sourcing layer

2. **CQRS needed** (separate read/write models)
   - Current: Single model for both
   - But: Analytics queries are separate (via CDC)
   - If more complex: Full CQRS might help

3. **Complex workflows** (multi-step sagas)
   - Current: Simple registration
   - But: Could have cancellation → promotion → notification
   - If much more complex: Sagas/orchestration might help

4. **Temporal queries** (what was capacity at 3pm?)
   - Current: Audit log, but must reconstruct
   - If many temporal queries: Event sourcing better

---

## SCALE CONDITION

Transactions stop being appropriate at:

**Registrations per second**: 10,000+
- Reason: Lock contention becomes severe
- Solution: Shard by event
- Beyond: Need optimistic locking or event sourcing

**Event capacity**: 1,000,000+ seats
- Reason: Transaction latency adds up
- Solution: Pre-commit optimization
- Beyond: Redesign with eventual consistency

**Geographic distribution**: Global users
- Reason: Network latency to database grows
- Solution: Regional databases, Cassandra-like eventual consistency
- Beyond: Event sourcing (accept eventual)

---

## LEARNING QUESTION

**Question**:
> "If two guests try to register for the last seat simultaneously with transactions, explain step-by-step what happens and why only one can succeed. Then explain what would happen without transactions."

**What this tests**:
- Do you understand database locking?
- Do you know serialization works?
- Do you understand race conditions?
- Can you reason about both sequential and concurrent execution?

**Answer key**:

**With transactions**:
1. Thread A acquires lock on event
2. Thread B waits for lock
3. Thread A reads capacity: 99 seats taken, 100 limit
4. Thread A: 99 + 1 <= 100? YES
5. Thread A creates registration, increments to 100
6. Thread A commits, releases lock
7. Thread B acquires lock
8. Thread B reads capacity: 100 seats taken, 100 limit
9. Thread B: 100 + 1 <= 100? NO
10. Thread B creates waitlist registration
11. Thread B commits

Result: One confirmed, one waitlisted ✓

**Without transactions**:
1. Thread A reads capacity: 99
2. Thread B reads capacity: 99 (RACE CONDITION!)
3. Thread A: 99 + 1 <= 100? YES
4. Thread B: 99 + 1 <= 100? YES
5. Thread A creates registration, sets to 100
6. Thread B creates registration, sets to 100 (WRONG!)

Result: Both confirmed, capacity exceeded ✗

---

# DECISION 4: CDC for Analytics (Not Real-Time Aggregation)

## What it currently does

**Current approach**:
1. Guest registers
2. Database updated
3. CDC worker polls oplog every 5 seconds
4. Detects registration change
5. Projects to analytics collection (pre-aggregated)
6. Dashboard queries analytics (fast)

**Alternative would be**:
1. Guest registers
2. Database updated
3. Dashboard queries registrations, runs aggregation pipeline
4. Returns results

**Where implemented**:
- CDC: `src/workers/cdc-worker.ts`
- Projection: `src/lib/cdc-projection.ts`
- Analytics model: `src/models/AnalyticsTimeSeries.ts`

---

## WHY THIS? (CDC Pre-Aggregation)

### Problem it solves

Dashboard needs real-time capacity metrics:
- How many guests registered?
- How many on waitlist?
- What's utilization?

Without CDC (query-time aggregation):
```javascript
db.registrations.aggregate([
  {$match: {eventId, status: 'confirmed'}},
  {$group: {_id: null, total: {$sum: '$seatsRequested'}}}
]); // Scans 1M registrations, slow query
```

With CDC (pre-aggregated):
```javascript
db.analytics.findOne({eventId}); // Direct lookup, fast
```

### Engineering principles

**Separation of concerns**:
- Operational database (registrations) for reads/writes
- Analytics database (pre-aggregated) for reporting
- CDC bridges them

**Performance optimization**:
- Query-time computation is expensive (O(n))
- Pre-computation is cheap (O(1) insertion)
- Tradeoff: Storage for speed

### Evidence supporting it

**File**: `src/workers/cdc-worker.ts`
```typescript
// Polls every 5 seconds
setInterval(async () => {
  const changes = await getChangesFromOplog();
  
  for (const change of changes) {
    if (change.operationType === 'insert') {
      const registration = change.fullDocument;
      
      // Project to analytics
      await AnalyticsTimeSeries.updateOne(
        {
          eventType: 'registration',
          hourBucket: getHourBucket(registration.createdAt),
          dimensions: {eventId: registration.eventId}
        },
        {
          $inc: {
            'metrics.count': 1,
            'metrics.seatsRequested': registration.seatsRequested
          }
        },
        {upsert: true}
      );
    }
  }
  
  // Save resume token (progress marker)
  await saveResumeToken(lastPosition);
}, 5000);
```

**File**: `src/models/AnalyticsTimeSeries.ts`
```typescript
// Pre-aggregated data
{
  eventType: 'registration',
  hourBucket: ISODate('2024-01-15T14:00:00Z'),
  dimensions: {eventId: ObjectId('...')},
  metrics: {
    count: 150,                    // 150 registrations this hour
    seatsRequested: 450,          // Total seats booked
    confirmed: 120,                // How many confirmed
    waitlisted: 30
  }
}
```

**File**: `src/app/api/metrics/capacity/route.ts`
```typescript
// Dashboard query (fast!)
const metrics = await AnalyticsTimeSeries.findOne({
  eventType: 'registration',
  eventId: req.query.eventId
});

// Direct response, no aggregation
return Response.json({
  registered: metrics.metrics.count,
  waitlisted: metrics.metrics.waitlisted,
  utilization: (metrics.metrics.count / capacity) * 100
});
```

---

## WHY NOT THAT? (Realistic Alternatives)

### Alternative 1: Query-Time Aggregation

**How it would work**:
```typescript
export async function GET(req: Request) {
  const eventId = req.query.eventId;
  
  // Aggregate at query time
  const results = await db.registrations.aggregate([
    {$match: {eventId, status: 'confirmed'}},
    {$group: {
      _id: null,
      confirmed: {$sum: 1},
      seatsRequested: {$sum: '$seatsRequested'}
    }}
  ]);
  
  return Response.json(results[0]);
}
```

**Advantages**:
- Single source of truth (registrations table)
- No stale data (always current)
- No CDC worker needed
- Simpler system (one database)
- Less storage (no duplication)

**Disadvantages**:
- Slow queries (scans all registrations)
- Database load (aggregation expensive)
- Dashboard latency (hundreds of milliseconds)
- Doesn't scale (queries get slower with more data)

**Performance**:
- 100K registrations: ~100ms per query
- 1M registrations: ~1s per query
- 10M registrations: ~10s per query (unusable)

**Scalability**: Poor
- Each query scans more data
- Database CPU maxes out

**Why current is better**:
- Dashboard response < 10ms (pre-aggregated)
- Database not slowed (aggregation in worker)
- Consistent user experience

---

### Alternative 2: Materialized Views (SQL)

**How it would work** (if using PostgreSQL):
```sql
CREATE MATERIALIZED VIEW registration_metrics AS
SELECT 
  event_id,
  COUNT(*) as registered_count,
  SUM(seats_requested) as total_seats,
  COUNT(CASE WHEN status = 'confirmed' THEN 1 END) as confirmed_count
FROM registrations
GROUP BY event_id;

-- Refresh every 1 minute
REFRESH MATERIALIZED VIEW registration_metrics;
```

**Advantages**:
- Built into database (no separate CDC)
- Still pre-aggregated (fast queries)
- Automatic refresh schedule
- SQL standard (portable)

**Disadvantages**:
- Refresh blocks reads (lock acquired)
- Stale data (until refresh completes)
- All materialized views refresh on schedule
- Refresh might be too frequent or infrequent

**Why current is better**:
- CDC refreshes only when data changes (efficient)
- No refresh blocking (event-driven)
- Finer grained (can update just changed event)

---

### Alternative 3: Caching Layer Only (Redis)

**How it would work**:
```typescript
export async function GET(req: Request) {
  const eventId = req.query.eventId;
  const cacheKey = `metrics:${eventId}`;
  
  // Try cache first
  let metrics = await redis.get(cacheKey);
  
  if (!metrics) {
    // Not in cache, aggregate from DB
    metrics = await db.registrations.aggregate([
      {$match: {eventId}},
      {$group: {_id: null, count: {$sum: 1}}}
    ]);
    
    // Store in cache for 5 minutes
    await redis.set(cacheKey, JSON.stringify(metrics), 'EX', 300);
  }
  
  return Response.json(JSON.parse(metrics));
}
```

**Advantages**:
- Simple (just add cache)
- No CDC worker needed
- Still fast (cache hit)

**Disadvantages**:
- Stale data (if cache hit)
- Cache miss = slow query
- No guarantee hits (depends on access pattern)
- Monitoring hard (hit rate unknown)

**Hit rate problem**:
- First request to event: cache miss (slow)
- Subsequent requests: fast (hits)
- If many events: low hit rate

**Why current is better**:
- Always fast (pre-aggregated)
- No cache misses
- Guaranteed performance

---

## TRADEOFF

### What CDC gains
✓ Always fast queries (O(1) lookups)  
✓ No database load from aggregation  
✓ Event-driven (updates when needed)  
✓ Scales with data volume (no slowdown)  
✓ Decoupled (analytics separate from operational)  

### What it sacrifices
✗ Data staleness (5-second lag)  
✗ Extra infrastructure (CDC worker)  
✗ Storage (duplicate data in analytics DB)  
✗ Complexity (projection logic)  
✗ Failure scenarios (what if CDC falls behind?)  

---

## FAILURE POINT

CDC becomes problematic when:

1. **CDC worker crashes**
   - Current: Dashboard shows stale data
   - Problem: How long until noticed?
   - Solution: Monitoring, auto-restart

2. **CDC falls behind** (changes happen faster than processing)
   - Current: Analytics lag grows
   - Problem: Dashboard increasingly inaccurate
   - Solution: Speed up worker or add more workers

3. **Oplog rolls off** (too much data, old changes lost)
   - Current: Resume token becomes invalid
   - Problem: Must resync entire database
   - Solution: Backfill script needed

4. **Projection logic wrong**
   - Current: Analytics database has wrong aggregates
   - Problem: Dashboard shows incorrect metrics
   - Solution: Backfill with correct logic

5. **Data inconsistency**
   - Current: Analytics shows 150 registrations, but DB has 148
   - Problem: User confusion
   - Solution: Reconciliation job

---

## CHANGE CONDITION

Use query-time aggregation instead if:

1. **Analytics not critical**
   - Current: Uses CDC for speed
   - If not important: Can aggregate at query time

2. **Single event** (not many)
   - Requirement: Only track one event's metrics
   - Solution: Query-time aggregation sufficient
   - If many events: CDC better

3. **No real-time requirement**
   - Current: 5-second freshness
   - If hourly sufficient: Scheduled job better than CDC

4. **Small dataset** (< 100K registrations)
   - Current: CDC overhead not justified
   - If small: Query-time aggregation fast enough
   - If large: CDC necessary

---

## SCALE CONDITION

CDC stops being appropriate at:

**Change rate**: > 1M changes/second
- Reason: Worker can't keep up
- Solution: Kafka instead of oplog polling
- Beyond: Distributed event log needed

**Analytics complexity**: 100+ different aggregations
- Reason: CDC projections become complex
- Solution: Separate analytics service (Elasticsearch)
- Beyond: Data warehouse (BigQuery, Snowflake)

**Freshness requirement**: < 1 second
- Reason: CDC polls every 5 seconds
- Solution: Change stream listener (not polling)
- Beyond: Event streaming (Kafka)

**Data volume**: > 1PB
- Reason: Oplog limited, analytics DB huge
- Solution: Data warehouse + ETL
- Beyond: Completely different architecture

---

## LEARNING QUESTION

**Question**:
> "The dashboard needs to show current registration count. Explain why query-time aggregation would be slow as the system grows, and how CDC pre-aggregation solves it. What's the cost of this solution?"

**What this tests**:
- Do you understand algorithmic complexity (O(n) vs O(1))?
- Do you know about query performance?
- Do you understand tradeoffs (storage vs speed)?
- Can you think about scalability?

**Answer key**:

Query-time aggregation:
```
Count = registrations.filter(r => r.eventId == X && r.status == 'confirmed').length
```
- 100K registrations: ~100ms
- 1M registrations: ~1s
- 10M registrations: ~10s (unusable)

As data grows, query time grows proportionally O(n). Linear slowdown.

CDC pre-aggregation:
```
Count = analytics.findOne({eventId: X}).metrics.count
```
- 100K registrations: ~1ms
- 1M registrations: ~1ms
- 10M registrations: ~1ms (constant time O(1))

Cost:
- Storage: Keep two copies of data (analytics + operational)
- Complexity: CDC worker, projection logic
- Staleness: 5-second lag instead of real-time
- Failure modes: CDC crashes → stale data

Tradeoff: Pay in storage & complexity to gain speed & scalability.

---

# DECISION 5-15: (Condensed for Space)

[Following the same detailed analysis structure for each remaining decision]

---

# DECISION 5: Multi-Layer Caching (Redis L1 + Memory L2)

## Why two caches?

**L1 (Redis)**: Persistent, shared across processes
- Survives restarts
- Shared between servers
- Good for: Sessions, shared state

**L2 (Memory)**: Fast, process-local
- No network latency
- Good for: Hot events, user profiles
- Bad for: Takes memory per server

**Why not just Redis?**
- Network latency (5-10ms per round trip)
- Every request hits Redis
- Redis becomes bottleneck

**Why not just Memory?**
- Lost on process restart
- Not shared between servers
- Different cache per server

**Tradeoff**: Storage for speed (L2) + persistence for shared state (L1)

**LEARNING QUESTION**: Why might L2 cache be a problem in load-balanced system with 10 servers? How does this affect registration response times?

---

# DECISION 6: JWT + OAuth Authentication

## Why JWT not sessions?

**JWT**:
- Stateless (no server session needed)
- Each request validates signature
- Can verify offline
- Good for distributed systems

**Sessions**:
- Server stores state
- Only ID sent to client
- Must verify on every request
- Good for monolithic

**Why current approach**:
- Scalable (no session store needed)
- Distributed-ready
- Standard across services

**LEARNING QUESTION**: What would happen if JWT secret key was compromised? Why is this different from session hijacking?

---

# DECISION 7: RBAC + ABAC Authorization

## Why both?

**RBAC** (Role-Based):
- Simple roles (admin, host, guest)
- Fast checks
- Good for: Basic permissions

**ABAC** (Attribute-Based):
- Complex rules (can register if event published)
- Flexible
- Good for: Context-dependent permissions

**Why not just RBAC?**
- Can't express "user owns this event"
- Can't express "event is published"

**Why not just ABAC?**
- Slow (must evaluate many rules)
- Complex (hard to manage)

**Tradeoff**: Combine both for speed + flexibility

**LEARNING QUESTION**: How would you check "can host edit this event" using just RBAC? Why would ABAC be needed?

---

# DECISION 8: Outbox Pattern

## Why write to outbox table?

**Without outbox**:
1. Registration written to DB
2. Oplog updated
3. CDC picks it up
4. If crash between 1 and 3: CDC misses change

**With outbox**:
1. Registration AND outbox entry written (same transaction)
2. CDC processes both
3. Even if crash, outbox ensures no loss

**Tradeoff**: Extra write for reliability

**LEARNING QUESTION**: What if CDC processes outbox but hasn't marked it complete, then crashes? How does system recover?

---

# DECISION 9: Job Queue for Async

## Why queue email instead of sending synchronously?

**Current**:
- Registration succeeds
- Email queued
- Response sent (fast)
- Email sent in background

**Synchronous**:
- Registration succeeds
- Email sent
- Response sent (slow)
- If email fails, registration fails

**Tradeoff**: Response latency vs guaranteed email delivery

**LEARNING QUESTION**: If email queue is full and returns error, should registration fail? Why or why not?

---

# DECISION 10: SSE for Real-Time

## Why Server-Sent Events not WebSocket?

**SSE**:
- One-way push (server → client)
- Simpler protocol
- Auto-reconnect
- Works over HTTP

**WebSocket**:
- Bidirectional
- Persistent connection
- Lower overhead
- Requires proxy support

**For audit stream**:
- Only need server → client
- SSE sufficient
- Simpler to implement

**LEARNING QUESTION**: If audit stream needed client → server communication (e.g., filtering), would SSE still be appropriate?

---

# DECISION 11: React Query for State

## Why not Redux or Zustand?

**React Query**:
- Server state management
- Caching strategies
- Automatic refetching
- Optimistic updates

**Redux/Zustand**:
- Client state management
- Manual cache logic
- Simpler for small apps

**Difference**:
- React Query manages "where did this data come from?" (server)
- Redux manages "where is this data right now?" (client)

**LEARNING QUESTION**: If you removed React Query but kept same data fetching logic, what features would break? (Hint: caching, invalidation, stale-while-revalidate)

---

# DECISION 12: Separate Analytics Database

## Why not query registrations for dashboard?

**Current**:
- Registrations for fast writes (atomic)
- Analytics for fast reads (pre-aggregated)

**Without separation**:
- Single database optimized for writes (bad for aggregation)
- Or optimized for reads (bad for transactions)
- Can't have both optimal

**Tradeoff**: Storage for specialized optimization

**LEARNING QUESTION**: If you could only have one database, would you optimize for registration writes or dashboard reads? What breaks?

---

# DECISION 13: Audit Logging

## Why immutable append-only log?

**Audit log**:
- Never delete entries
- Never modify entries
- Append only
- Signed if high security

**Why immutable**:
- Proof of what happened
- Can't cover up mistakes
- Good for compliance
- Good for debugging

**LEARNING QUESTION**: If audit log showed "user deleted event" but audit also showed "user wasn't logged in", what should system do? (Hint: data inconsistency detection)

---

# DECISION 14: Circuit Breaker

## Why not just retry?

**Retry**:
- Try request
- If fails, wait and try again
- Eventually succeeds or fails

**Circuit breaker**:
- Try request
- If fails too much, STOP trying (OPEN)
- After wait, try one request (HALF_OPEN)
- If succeeds, allow requests (CLOSED)

**Without circuit breaker**:
- 10k queued email jobs
- Email service down
- All jobs retry repeatedly
- Wasted resources

**With circuit breaker**:
- After 3 failures, OPEN
- Stop queuing jobs
- Wait 30 seconds
- Try one job
- If fails, stay OPEN

**LEARNING QUESTION**: If circuit breaker is OPEN, should registration fail? What should user see?

---

# DECISION 15: Layered Architecture

## Why Controller → Service → Repository → DB?

**Why layers**:
- Separation of concerns
- Testability (mock layers)
- Reusability (service used by API and workers)
- Clarity (clear responsibility)

**Without layers** (monolithic controller):
- Everything in one function
- Hard to test
- Hard to reuse
- Hard to understand

**Tradeoff**: More files, more boilerplate for clarity

**LEARNING QUESTION**: If you needed to send SMS notification on registration (in addition to email), which layer would you add it to? Why?

---

# Summary Table: All Decisions

| Decision | Current | Alternative | Tradeoff | Break Point | Scale Limit |
|----------|---------|------------|----------|------------|------------|
| **MongoDB** | Transactions, flexible schema | PostgreSQL | Speed vs enforced schema | Analytical queries complex | > 1M concurrent |
| **Monolithic + workers** | Single API + async workers | Microservices | Simplicity vs scaling | Can't scale registration independently | > 100K reg/sec |
| **Transactions** | ACID guarantee | Event sourcing | Consistency vs replay-ability | Distributed txns needed | > 10K/sec per event |
| **CDC** | Pre-aggregated analytics | Query-time aggregation | Storage + complexity vs speed | CDC falls behind changes | > 1M changes/sec |
| **Multi-cache** | Redis L1 + Memory L2 | Redis only or memory only | Storage vs latency | Cache miss rate high | > 100GB data |
| **JWT + OAuth** | Stateless, distributed | Sessions | Scalability vs revocation | Token compromise easy | Auth critical |
| **RBAC + ABAC** | Simple + flexible | Just RBAC | Complexity vs expressiveness | Complex rules hard to manage | > 100 rules |
| **Outbox** | Guaranteed delivery | Direct CDC | Storage vs reliability | CDC misses changes | High traffic |
| **Job queue** | Async processing | Synchronous | Response latency vs reliability | Queue full, jobs lost | > 1K jobs/sec |
| **SSE** | Server push | WebSocket | Simplicity vs bidirectional | Needs client → server | High throughput |
| **React Query** | Server state management | Redux | Flexibility vs simplicity | Manual cache logic | > 1M records |
| **Separate analytics** | Query-optimized | Single DB | Storage vs read performance | Joins needed | > 10TB data |
| **Audit log** | Immutable, append-only | Mutable log | Auditability vs flexibility | Compliance violation | Regulatory |
| **Circuit breaker** | Fail fast on errors | Pure retry | Operational complexity vs resource waste | External service critical | SLA required |
| **Layered architecture** | Clear separation | Monolithic | Code organization vs overhead | Large refactor needed | > 1M LOC |

---

# Meta-Question: Why These Choices?

## Engineering Philosophy Evident

1. **Pragmatism over purity**
   - Using transactions (not event sourcing) because simpler
   - Using monolithic (not microservices) because team small
   - Using CDC (not query-time) because performance matters

2. **Scalability first, but not premature**
   - Supports 1000+ registrations/second
   - Can be sharded for 10000+
   - But not overengineered for needs

3. **Operational simplicity**
   - Single MongoDB (not multiple databases initially)
   - Workers separate but same infrastructure
   - Monitoring built in (audit logs, metrics)

4. **Developer experience**
   - Node.js throughout (not polyglot)
   - JavaScript everywhere (backend + frontend)
   - Mongoose for familiar ORM patterns

5. **Failure handling**
   - Circuit breaker for external failures
   - Outbox pattern for reliability
   - Audit log for debugging

## What's Missing?

No evidence of:
- Rate limiting (DOS prevention)
- Request signing (API security)
- End-to-end encryption (data privacy)
- Multi-tenancy (customer isolation)
- Geo-replication (disaster recovery)
- Cost optimization (cloud spending)

These might be:
- Out of scope for current scale
- Added later if needed
- Assumed to be done elsewhere

---

# Questions for Architectural Review

1. **Monolithic + workers**: At what traffic level would microservices become necessary? Who decides?

2. **Transactions**: What's the plan if MongoDB transaction throughput becomes bottleneck?

3. **CDC**: What happens if CDC lag exceeds 1 hour? Is there monitoring?

4. **Caching**: How are cache invalidation bugs discovered in production?

5. **Auth**: How are JWT compromises handled? Can tokens be revoked?

6. **Outbox**: How does backfill work if oplog rolls off?

7. **Async**: What's the oldest job in queue? Is there monitoring?

8. **Real-time**: What if client doesn't support SSE? Fallback to polling?

9. **Query**: How are slow queries detected? What's the SLA?

10. **Layers**: How is architectural layering enforced? Code review rules?

---

# Learning Progression

## Beginner
Understand: Why was this tool chosen?  
Question: "Why MongoDB instead of PostgreSQL?"

## Intermediate
Understand: What are the tradeoffs?  
Question: "What did we gain/lose by using MongoDB?"

## Advanced
Understand: When would this break?  
Question: "At what scale does MongoDB stop working?"

## Expert
Understand: What design principles guided all decisions?  
Question: "What would you change if building this again with 100x scale?"

---

**This analysis represents understanding the "why" behind every significant choice in the architecture.**

True mastery comes from asking: "Would I make the same choice again, given current knowledge?"
