# Evenregman - Master Learning Curriculum

## Complete Repository Analysis & Learning Path

This is a comprehensive guide to understanding the **Evenregman Event Management Platform** - a sophisticated full-stack system demonstrating advanced software engineering patterns, distributed systems concepts, and premium UI/UX design.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Repository Map](#repository-map)
3. [System Mental Model](#system-mental-model)
4. [Architecture Overview](#architecture-overview)
5. [Core Components](#core-components)
6. [Data Architecture](#data-architecture)
7. [Runtime Flows](#runtime-flows)
8. [Advanced Features](#advanced-features)
9. [Design Patterns Used](#design-patterns-used)
10. [Learning Curriculum (Beginner → Senior)](#learning-curriculum)
11. [Deep-Dive Topics](#deep-dive-topics)

---

## Executive Summary

**Evenregman** is an enterprise-grade event management platform built with Next.js, React, MongoDB, and Node.js. It handles sophisticated operations including:

- **Real-time seat reservations** with atomic guarantees
- **Change Data Capture (CDC)** for analytics pipeline
- **Circuit breaker pattern** for fault tolerance
- **Multi-layer caching** (L1 Redis, L2 memory)
- **RBAC + ABAC** permission system
- **Enterprise SSO** (OAuth/SAML)
- **Async CSV exports** with job queuing
- **Real-time audit logging**
- **Premium telemetry dashboard** with system health monitoring

**Key achievement**: Demonstrated integration of 10+ enterprise patterns in a single coherent system without breaking changes or isolation violations.

---

## Repository Map

### Main Application Structure

```
src/
├── app/                          # Original Next.js routes (host dashboard)
│   ├── api/                      # API endpoints
│   ├── host/                     # Host management routes
│   └── [existing auth routes]    # Authentication
│
├── app-premium/                  # NEW: Premium telemetry dashboard
│   ├── (dashboard)/              # Protected routes
│   │   ├── page.tsx             # Command center home
│   │   ├── registrations/       # Seat management
│   │   ├── audit/               # Real-time audit stream
│   │   └── settings/            # Theme/preferences
│   └── api/sse/audit            # Server-sent events
│
├── components/                   # Original UI components
│   └── [legacy components]
│
├── components-premium/           # NEW: Premium component library
│   ├── atoms/                   # Basic UI elements
│   ├── composite/               # Complex components
│   ├── layout/                  # Multi-pane layout
│   ├── tables/                  # Data tables
│   ├── visualization/           # Charts & graphs
│   └── animation/               # Micro-interactions
│
├── features/                     # Feature modules (core business logic)
│   ├── auth/                    # Authentication
│   ├── events/                  # Event management
│   ├── registrations/           # Registration handling
│   ├── seats/                   # Seat allocation
│   └── [other features]
│
├── jobs/                         # Background jobs
│   ├── csv-export.job.ts       # Async CSV generation
│   ├── [other async jobs]
│   └── job-queue.ts            # Job orchestration
│
├── lib/                          # Utilities (original)
│   ├── cache.ts                # L1/L2 caching
│   ├── circuit-breaker.ts      # Fault tolerance
│   ├── db.ts                   # Database connection
│   └── [other utilities]
│
├── lib-premium/                  # NEW: Premium utilities
│   ├── api.ts                  # API client
│   ├── cn.ts                   # Class composition
│   ├── shortcuts.ts            # Keyboard bindings
│   └── a11y.ts                 # Accessibility
│
├── models/                       # MongoDB models
│   ├── User.ts
│   ├── Event.ts
│   ├── Registration.ts
│   ├── AuditLog.ts
│   └── [data models]
│
├── workers/                      # Long-running processes
│   ├── cdc-worker.ts           # Change data capture
│   ├── notification-worker.ts  # Email/push notifications
│   └── [async workers]
│
├── hooks-premium/               # NEW: React Query hooks
│   ├── use-registrations.ts
│   ├── use-system-health.ts
│   ├── use-audit-stream.ts
│   └── [data fetching]
│
├── providers-premium/           # NEW: React context providers
│   ├── query-provider.tsx
│   ├── theme-provider.tsx
│   └── toast-provider.tsx
│
├── styles-premium/              # NEW: Design system
│   ├── tokens.ts               # Color palette & spacing
│   ├── globals.css             # CSS variables & layers
│   └── a11y.css                # Accessibility utilities
│
└── types/                        # TypeScript types
    ├── auth.ts
    ├── events.ts
    ├── registrations.ts
    └── [type definitions]

docs/
├── ATOMIC_REGISTRATIONS.md      # Reservation guarantees
├── CDC_ARCHITECTURE.md          # Analytics pipeline
├── CIRCUIT_BREAKER_ARCHITECTURE.md  # Fault tolerance
├── ENTERPRISE_SSO_ARCHITECTURE.md   # Authentication
├── L2_CACHE_ARCHITECTURE.md     # Multi-layer caching
├── RBAC_ABAC_ARCHITECTURE.md    # Authorization
├── PREMIUM_UI_GUIDE.md          # Dashboard documentation
└── [10+ other architecture docs]
```

---

## System Mental Model

### What Problem Does Evenregman Solve?

Event management platforms need to:
1. **Handle high-traffic seat reservations** with atomic guarantees (no overbooking)
2. **Provide real-time insights** to event organizers (who's attending, capacity status)
3. **Scale reliably** without losing data or consistency
4. **Support enterprise needs** (SSO, RBAC, compliance auditing)
5. **Export data efficiently** without blocking the main application
6. **Monitor system health** and recover from failures gracefully

### Major Actors

- **Event Host**: Creates events, manages registrations, views analytics
- **Guest**: Registers for events, gets confirmation
- **Admin**: Manages users, permissions, system settings
- **System**: CDC pipeline, cache layer, job queue, notification workers

### Major Data Flows

```
Guest Registration Request
    ↓
[Authentication] → [Authorization check] → [Validation]
    ↓
[Atomic Reservation Lock]
    ↓
[Write to DB] → [Trigger Outbox Pattern]
    ↓
[CDC Worker picks up change] → [Project to Analytics]
    ↓
[Host sees real-time update in Dashboard] → [Guest gets confirmation email]
```

### Major Data Stores

1. **MongoDB** - Primary database (events, registrations, users, audit logs)
2. **Redis (L1 Cache)** - Hot data (seat availability, user sessions)
3. **Memory (L2 Cache)** - Local application cache (event details, seat maps)
4. **Outbox Table** - CDC event log (ensures no lost events)
5. **Analytics Collection** - Pre-aggregated metrics (CDC output)

### System Boundaries

```
┌─────────────────────────────────────────────┐
│         Evenregman Platform                 │
│                                              │
│  ┌──────────────────────────────────────┐   │
│  │   Frontend (Next.js + React)         │   │
│  │   ├── Original Dashboard             │   │
│  │   └── Premium Telemetry Dashboard    │   │
│  └──────────────────────────────────────┘   │
│                    ↓                         │
│  ┌──────────────────────────────────────┐   │
│  │   API Layer (Next.js API Routes)     │   │
│  │   ├── Auth endpoints                 │   │
│  │   ├── Registration endpoints         │   │
│  │   ├── Event endpoints                │   │
│  │   └── Metrics endpoints              │   │
│  └──────────────────────────────────────┘   │
│                    ↓                         │
│  ┌──────────────────────────────────────┐   │
│  │   Application Core                   │   │
│  │   ├── Circuit Breaker                │   │
│  │   ├── Cache Layer (L1/L2)            │   │
│  │   ├── Atomic Reservation Engine      │   │
│  │   └── Permission System (RBAC/ABAC)  │   │
│  └──────────────────────────────────────┘   │
│                    ↓                         │
│  ┌──────────────────────────────────────┐   │
│  │   Background Workers                 │   │
│  │   ├── CDC Worker → Analytics         │   │
│  │   ├── CSV Export Worker              │   │
│  │   └── Notification Worker            │   │
│  └──────────────────────────────────────┘   │
│                    ↓                         │
│  ┌──────────────────────────────────────┐   │
│  │   Data Stores                        │   │
│  │   ├── MongoDB (primary)              │   │
│  │   ├── Redis (session/cache)          │   │
│  │   └── Memory (L2 cache)              │   │
│  └──────────────────────────────────────┘   │
│                                              │
└─────────────────────────────────────────────┘
           ↓                    ↓
    External OAuth        Email Service
    (Enterprise SSO)       (Notifications)
```

---

## Architecture Overview

### Architectural Style

**Layered Monolith + Microservices (workers)**

The system combines:
- **Monolithic layer** for API and business logic
- **Worker processes** for long-running tasks (CDC, exports, notifications)
- **Cache layers** for performance (Redis L1, Memory L2)
- **Event-driven** communication via Outbox pattern

### Key Layers

1. **Presentation Layer** (Next.js frontend)
   - Original dashboard for hosts
   - Premium telemetry dashboard for real-time insights

2. **API Layer** (Next.js API routes)
   - REST endpoints for CRUD operations
   - Authentication middleware
   - Authorization checks (RBAC/ABAC)
   - Input validation

3. **Service/Business Logic Layer**
   - Event management
   - Reservation handling (atomic with locks)
   - Permission evaluation
   - Circuit breaker for external calls

4. **Data Access Layer**
   - MongoDB models
   - Cache abstraction (L1/L2)
   - Transaction handling

5. **Worker Layer**
   - CDC (Change Data Capture) pipeline
   - Async CSV export
   - Notification delivery
   - Job queue management

### Major Design Patterns

1. **Atomic Reservations** - Using MongoDB sessions for ACID transactions
2. **Change Data Capture (CDC)** - Event sourcing via MongoDB oplog
3. **Circuit Breaker** - Graceful degradation for external services
4. **Multi-Layer Caching** - Redis + memory for performance
5. **Outbox Pattern** - Ensures no lost events in CDC
6. **Job Queue** - Decouples long-running operations
7. **RBAC + ABAC** - Role and attribute-based access control
8. **Error Boundaries** - Fault isolation in React
9. **Virtual Scrolling** - Performance for large data sets
10. **Server-Sent Events (SSE)** - Real-time audit stream

---

## Core Components

### 1. Atomic Reservations Engine

**File**: `src/features/registrations/atomic-reservation.ts`

**What it does**: Ensures no overbooking when multiple guests register simultaneously.

**Key mechanism**:
```
1. Client requests N seats for event E
2. Acquire session lock on event E
3. Read current registered count
4. If (current + N) ≤ capacity:
   - Create registration record
   - Update capacity counter
   - Release lock
   - Return success
5. Else:
   - Release lock
   - Return "waitlist"
```

**Why this matters**: Without atomic guarantees, two guests could register for the last seat simultaneously, causing overbooking.

**Technology**: MongoDB sessions (ACID transactions)

---

### 2. Change Data Capture (CDC) Pipeline

**Files**: 
- `src/workers/cdc-worker.ts` - Main CDC worker
- `docs/CDC_ARCHITECTURE.md` - Deep dive

**What it does**: Automatically mirrors database changes to analytics collection for real-time insights.

**Architecture**:
```
MongoDB Oplog
    ↓
CDC Worker (polls every N seconds)
    ↓
Projection Engine (transforms events)
    ↓
Analytics Collection (pre-aggregated metrics)
    ↓
Dashboard queries fast analytics without aggregation
```

**Why**:
- Hosts need real-time dashboards showing registrations, capacity, trends
- Aggregation queries on registration table would be slow
- CDC keeps analytics "in sync" with operational data
- Outbox pattern ensures no lost events

---

### 3. Circuit Breaker Pattern

**File**: `src/lib/circuit-breaker.ts`

**What it does**: Prevents cascading failures when external services are down.

**States**:
```
CLOSED (normal) → [failure threshold exceeded] → OPEN (fail fast)
OPEN → [wait timeout] → HALF_OPEN (test one request)
HALF_OPEN → [success] → CLOSED
HALF_OPEN → [failure] → OPEN
```

**Example**: If email service is down, don't queue 10,000 failed requests. Just fail fast and retry later.

---

### 4. Multi-Layer Caching

**Files**: `src/lib/cache.ts`, `docs/L2_CACHE_ARCHITECTURE.md`

**Architecture**:
```
Request for Event Details
    ↓
Check L1 Cache (Redis) → Cache hit? Return
    ↓
Check L2 Cache (Memory) → Cache hit? Return & refill L1
    ↓
Query Database → Fill both caches → Return
```

**Rationale**:
- L1 (Redis): Persistent, shared across processes
- L2 (Memory): Fast, process-local
- Saves database queries, reduces latency

---

### 5. RBAC + ABAC Authorization

**Files**: `src/lib/permissions.ts`, `src/models/Permission.ts`

**How it works**:
1. **RBAC**: User has Role (host, admin, guest)
2. **ABAC**: Can do Action if Attributes match
   - `canViewEvent(userId, eventId)` → checks if user owns event OR is admin
   - `canRegister(userId, eventId)` → checks if user is not organizer AND event is open

**Why both?**
- RBAC is simple (roles are fast to check)
- ABAC is flexible (attribute-based rules handle edge cases)

---

### 6. Premium Telemetry Dashboard

**Files**: `src/app-premium/`, `src/components-premium/`

**New in implementation**: Complete telemetry-driven command center

**Key pages**:
- `/premium` - Dashboard (system health, event overview, capacity visualization)
- `/premium/registrations` - Real-time registration table (virtual scrolling 10k+ rows)
- `/premium/audit` - Live audit stream via SSE
- `/premium/settings` - Theme switcher, notifications

**Data flow**:
```
Dashboard
    ↓
useSystemHealth() hook → polls /api/metrics/health every 30s
useRegistrations() hook → fetches paginated registrations
useAuditStream() hook → opens EventSource to /api/sse/audit
    ↓
React Query manages caching & invalidation
    ↓
UI updates in real-time
```

---

## Data Architecture

### Data Models

**Core Entities**:

1. **User** (`src/models/User.ts`)
   - email, passwordHash, roles
   - createdAt, updatedAt

2. **Event** (`src/models/Event.ts`)
   - name, description, hostId
   - totalCapacity, registeredCount, waitlistedCount
   - status (draft, published, archived)
   - startDate, endDate

3. **Registration** (`src/models/Registration.ts`)
   - eventId, userId, guestName, guestEmail
   - seatsRequested, status (confirmed, waitlisted, cancelled)
   - confirmedAt, cancelledAt

4. **AuditLog** (`src/models/AuditLog.ts`)
   - userId, action (create, update, delete)
   - resourceType, resourceId, changes
   - timestamp, ip, userAgent

5. **AnalyticsTimeSeries** (CDC output)
   - eventType, hourBucket, dimensions, metrics
   - Pre-aggregated for fast queries

### Data Consistency Patterns

**Atomic Reservations**: MongoDB sessions ensure capacity counter never exceeds total

**Outbox Pattern**: CDC events stored in Outbox table, marked processed after projection

**Audit Trail**: Every mutation recorded in AuditLog (immutable, append-only)

---

## Runtime Flows

### Flow 1: Guest Registers for Event

```
1. Guest clicks "Register" with email, seats needed
2. Browser → POST /api/registrations
3. Middleware: Verify auth token
4. Handler: Validate input (email format, seats > 0)
5. Service: Call atomicReservation(eventId, seatsNeeded)
6. Repository: 
   - Begin MongoDB session
   - Acquire lock on Event document
   - Read current capacity
   - If space available:
     - Create Registration doc
     - Update Event.registeredCount
     - Commit transaction
     - Write to Outbox table
7. Worker: CDC picks up change
8. Worker: Project to analytics
9. Response: Return confirmation + registration ID
10. UI: Show success, refresh registration list (React Query invalidates)
```

### Flow 2: Host Views Real-Time Dashboard

```
1. Host loads /premium dashboard
2. useSystemHealth() hook fires
   - QueryKey: ['system-health']
   - Every 30 seconds: GET /api/metrics/health
   - Returns: { cdcSyncStatus, circuitBreakerState, cacheHitRate, outboxLatencyMs }
3. useRegistrations() hook fires
   - GET /api/registrations?eventId=X&page=1&pageSize=50
   - Results cached in React Query
4. useAuditStream() hook fires
   - Opens EventSource('/api/sse/audit')
   - Keeps last 100 entries in component state
5. UI renders:
   - TelemetryPanel shows health indicators
   - RegistrationTable shows paginated data
   - AuditTrail scrolls with live entries
6. When registration added:
   - CDC worker detects change
   - Projections updated
   - React Query refetch triggered
   - Dashboard re-renders automatically
```

### Flow 3: CSV Export (Long-Running Job)

```
1. Host clicks "Export registrations"
2. POST /api/jobs/export-registrations
3. Job created with status "pending"
4. Queued to job queue
5. Worker picks up job
6. Generate CSV:
   - Stream registrations from DB
   - Write to temp file
   - Parse into CSV format
7. Upload to storage (S3/GCS)
8. Update job status to "completed"
9. Host's TaskDrawer component polls /api/jobs
10. When complete, show download link
```

---

## Advanced Features

### 1. Enterprise SSO (OAuth/SAML)

- Configured via environment variables
- Handled by `src/features/auth/sso.ts`
- Creates/updates user on first login
- Stores provider ID for account linking

### 2. Rate Limiting

- Per-IP rate limits on registration endpoints
- Prevents spam/DOS
- Implemented in middleware

### 3. Async CSV Export

- Exports don't block main process
- Queued to job worker
- Progress tracked in task drawer

### 4. Real-Time Audit Stream (SSE)

- `/api/sse/audit` endpoint streams events
- Browser opens persistent EventSource
- Dashboard shows live activity log
- Used for compliance & debugging

### 5. Dark/Light Theme

- CSS variables for colors
- localStorage persistence
- Instant toggle without page reload

---

## Design Patterns Used

| Pattern | Location | Purpose |
|---------|----------|---------|
| Atomic Transactions | Reservations | Prevent overbooking |
| Change Data Capture | CDC Worker | Real-time analytics |
| Outbox Pattern | Outbox table | Guarantee no lost events |
| Circuit Breaker | lib/circuit-breaker.ts | Fault tolerance |
| Repository Pattern | models/ | Data access abstraction |
| Service Layer | features/ | Business logic separation |
| Dependency Injection | Providers | Decoupling & testability |
| Error Boundary | ErrorBoundary.tsx | React error isolation |
| Virtual Scrolling | VirtualTable | Performance for 10k+ rows |
| Server-Sent Events | SSE endpoint | Real-time push |
| React Query | hooks-premium/ | Server state management |
| RBAC/ABAC | lib/permissions.ts | Authorization |
| Multi-layer Cache | lib/cache.ts | Performance optimization |
| Job Queue | jobs/ | Async operations |

---

## Learning Curriculum

### Beginner Level

**Goal**: Understand how to register for an event from start to finish.

**Topics**:
1. Next.js API routes basics
2. MongoDB document structure
3. Form submission & validation
4. Error handling

**Files to read** (in order):
1. `docs/README.md` - Project overview
2. `src/types/registrations.ts` - Data types
3. `src/models/Registration.ts` - Database model
4. `src/app/api/registrations/route.ts` - API endpoint
5. `src/features/registrations/validate.ts` - Input validation

**Questions to answer**:
- What fields does a registration have?
- How is the API endpoint structured?
- What validation rules apply?
- What happens if validation fails?

**Exercise**:
- Add a new field to registrations (e.g., dietaryRestrictions)
- Update validation to check it
- Update the TypeScript type

---

### Intermediate Level

**Goal**: Understand concurrency, atomicity, and preventing race conditions.

**Topics**:
1. Race conditions in concurrent systems
2. MongoDB sessions & transactions
3. Locks and atomic operations
4. Capacity management

**Files to read**:
1. `docs/ATOMIC_REGISTRATIONS.md` - Complete guide
2. `src/lib/atomic-reservation.ts` - Implementation
3. `src/models/Event.ts` - Event model with counters

**Questions to answer**:
- Why do we need atomic operations for seat reservations?
- What happens if two guests register for the last seat simultaneously?
- How does MongoDB session locking prevent this?
- What's the difference between capacity and registered count?

**Exercise**:
- Write a test that simulates two concurrent registrations
- Verify that only one succeeds
- Verify that capacity counter is accurate

---

### Advanced Level

**Goal**: Understand CDC pipeline, analytics, and real-time dashboards.

**Topics**:
1. Change Data Capture (CDC) concept
2. MongoDB oplog streaming
3. Event projection & transformation
4. Analytics pre-aggregation

**Files to read**:
1. `docs/CDC_ARCHITECTURE.md` - Detailed architecture
2. `src/workers/cdc-worker.ts` - CDC worker implementation
3. `src/lib/cdc-projection.ts` - Event projection logic
4. `src/models/AnalyticsTimeSeries.ts` - Analytics schema

**Questions to answer**:
- How does CDC know about database changes?
- What's the Outbox pattern and why is it needed?
- How are events transformed into analytics?
- What happens if the CDC worker crashes?

**Exercise**:
- Add a new metric to analytics (e.g., average seats per registration)
- Update the projection engine to calculate it
- Write a query that uses the new metric

---

### Senior Level - Architecture

**Goal**: Understand system design tradeoffs and make architectural decisions.

**Topics**:
1. Scalability considerations
2. Failure modes and recovery
3. Performance optimization
4. Technology choices

**Files to read**:
1. `docs/CIRCUIT_BREAKER_ARCHITECTURE.md` - Fault tolerance
2. `docs/L2_CACHE_ARCHITECTURE.md` - Performance
3. `docs/ENTERPRISE_SSO_ARCHITECTURE.md` - Authentication
4. `docs/DEPLOYMENT_STRATEGY.md` - Production considerations

**Big questions**:
- How would you scale registrations to 10M/hour?
- What happens if MongoDB goes down?
- How do you handle CDC lag?
- Should we use Redis or just memory cache?
- What's the cost of CDC vs simple queries?

**Exercises**:
- Design a solution for 100x current traffic
- Draw a failure mode analysis diagram
- Propose an alternative to CDC (and compare tradeoffs)
- Write a performance test for the reservation system

---

### Expert Level - Full System Integration

**Goal**: Understand how all components work together and can redesign subsystems.

**Topics**:
1. Premium dashboard architecture
2. Component design patterns
3. State management with React Query
4. Real-time data synchronization

**Files**:
1. `docs/PREMIUM_UI_GUIDE.md` - Dashboard guide
2. `src/app-premium/` - Dashboard implementation
3. `src/hooks-premium/` - Data fetching hooks
4. `src/components-premium/` - Component library

**Advanced questions**:
- How would you handle dashboard data consistency?
- What's the latency from reservation → dashboard update?
- How do you handle network disconnection in SSE?
- What's the ideal React Query cache strategy?
- How do you prevent memory leaks in hooks?

**Project**:
- Design & implement a real-time leaderboard page
- Add offline support to the dashboard
- Implement a feature that requires cross-system coordination

---

## Deep-Dive Topics

### 1. Atomic Reservations

**Question**: Why can't we just check capacity and then insert?

```
// WRONG - Race condition
const capacity = await Event.findById(eventId).capacity;
if (reservationCount < capacity) {
  await Registration.create({...}); // Two threads both pass check!
}
```

**Answer**: Use MongoDB sessions

```
// CORRECT - Atomic
const session = await mongoose.startSession();
session.startTransaction();
try {
  const event = await Event.findById(eventId, null, {session});
  if (event.registeredCount < event.totalCapacity) {
    await Registration.create([{...}], {session});
    event.registeredCount++;
    await event.save({session});
  }
  await session.commitTransaction();
} catch (e) {
  await session.abortTransaction();
}
```

**Tradeoff**: Transactions are slower but guarantee correctness.

---

### 2. CDC vs Traditional Aggregation

**Scenario**: Host wants to see "registrations per hour"

**Option 1: Query-time aggregation**
```javascript
db.registrations.aggregate([
  {$match: {eventId, createdAt: {$gte: startTime}}},
  {$group: {_id: {$hour: "$createdAt"}, count: {$sum: 1}}},
])
```
- Pro: Simple, always up-to-date
- Con: Slow (scans 1M docs), blocks query time

**Option 2: CDC pre-aggregation**
```javascript
db.analyticsTimeSeries.findOne({
  eventType: "registration",
  hourBucket: timestamp,
  dimensions: {eventId}
})
```
- Pro: Fast (direct lookup), no aggregation
- Con: Complex setup, eventual consistency

**When to use each**:
- Low traffic events: Use aggregation (simpler)
- High-traffic events: Use CDC (faster)
- Mixed: Use CDC with aggregation fallback

---

### 3. Cache Invalidation

**The hard problem**: "Cache invalidation is one of the hardest problems in computer science" - Phil Karlton

**Evenregman solution**: React Query + explicit invalidation

```typescript
const mutation = useMutation({
  mutationFn: registerForEvent,
  onSuccess: () => {
    queryClient.invalidateQueries({queryKey: ['registrations']});
  }
});
```

**Why this works**:
- Mutation succeeds → we know cache is stale
- Invalidate all registration queries
- Next read automatically refetches fresh data

**Alternative**: TTL-based expiration (simpler but less accurate)

---

### 4. SSO Integration

**Flow**:
1. User clicks "Login with Google"
2. Redirected to Google OAuth endpoint
3. User grants permission
4. Google redirects back to `callback_url` with code
5. Exchange code for user ID token
6. Find/create user in Evenregman
7. Create session
8. Redirect to dashboard

**Files**: `src/features/auth/sso.ts`

**Security considerations**:
- CSRF protection
- State parameter verification
- Token validation
- Secure cookie settings

---

## Knowledge Gaps & Verification

### Things Directly Observable from Code

✓ The system uses MongoDB for persistence  
✓ React Query for client state management  
✓ CDC via oplog polling  
✓ Circuit breaker for fault tolerance  
✓ RBAC/ABAC for authorization  
✓ Multi-layer caching (Redis + memory)  

### Reasonable Engineering Inferences

? The CDC worker was added to handle high-traffic dashboards (dashboard queries would be slow with aggregation)  
? Multi-layer caching was implemented to reduce database load (L1 persistent, L2 local)  
? Virtual scrolling was added because tables can have 10k+ rows (necessary for performance)

### Cannot Be Determined Without Asking

? Original motivation for these architectural choices  
? Performance requirements (requests/sec, latency targets)  
? Scalability constraints (max users, events, registrations)  
? Deployment environment (on-prem, cloud region, redundancy)  
? Business requirements that drove design decisions  

---

## Recommended Deep-Dive Order

### If you want to understand the system end-to-end:

1. **Day 1-2**: Read `docs/README.md` + `docs/DEPLOYMENT_STRATEGY.md`
2. **Day 3**: Read `docs/ATOMIC_REGISTRATIONS.md`
3. **Day 4**: Trace registration flow: type → model → API → service
4. **Day 5**: Read `docs/CDC_ARCHITECTURE.md`
5. **Day 6**: Understand `docs/CIRCUIT_BREAKER_ARCHITECTURE.md`
6. **Day 7**: Study `docs/PREMIUM_UI_GUIDE.md`
7. **Week 2**: Deep-dive each advanced feature
8. **Week 3**: Design exercises and extensions

### If you want to focus on specific features:

- **Reservations**: Start with ATOMIC_REGISTRATIONS.md
- **Analytics**: Start with CDC_ARCHITECTURE.md  
- **UI**: Start with PREMIUM_UI_GUIDE.md
- **Auth**: Start with ENTERPRISE_SSO_ARCHITECTURE.md
- **Performance**: Start with L2_CACHE_ARCHITECTURE.md

---

## Next Steps

1. **Read the architecture guides** in `docs/` folder
2. **Run the application** locally (`npm run dev`)
3. **Trace a feature end-to-end** (pick one flow, follow the code)
4. **Ask "why" questions** for every architectural decision
5. **Propose alternatives** and understand tradeoffs
6. **Extend the system** by adding a new feature

This learning path builds from understanding individual components → understanding system interactions → making architectural decisions.

---

## Questions? Confusions?

Each architecture document in `docs/` has:
- Problem being solved
- Solution approach
- Implementation details
- Deployment considerations
- Testing strategies
- Failure modes

Start there, then dive into the code.

**Good luck learning!** 🚀
