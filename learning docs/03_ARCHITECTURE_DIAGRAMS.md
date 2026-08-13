# Evenregman - Architecture Diagrams & Visual Reference

Complete visual representation of the Evenregman system using Mermaid diagrams.

---

## 1. System Context Diagram

```mermaid
graph TB
    User["👤 Event Host<br/>(Web Browser)"]
    Guest["👥 Guest<br/>(Web Browser)"]
    Admin["🔑 Admin<br/>(Web Browser)"]
    
    System["Evenregman<br/>Event Management<br/>Platform"]
    
    OAuth["🔐 OAuth/SAML<br/>Enterprise SSO"]
    Email["📧 Email Service<br/>(Notifications)"]
    Storage["☁️ Cloud Storage<br/>(CSV Exports)"]
    
    User -->|Register events,<br/>View dashboard| System
    Guest -->|Browse & register<br/>for events| System
    Admin -->|Manage users,<br/>Permissions| System
    
    System -->|Authenticate| OAuth
    System -->|Send emails| Email
    System -->|Store files| Storage
    
    style System fill:#4A90E2,stroke:#2E5C8A,color:#fff
    style User fill:#7ED321,stroke:#5FA000,color:#fff
    style Guest fill:#7ED321,stroke:#5FA000,color:#fff
    style Admin fill:#F5A623,stroke:#C17F1E,color:#fff
    style OAuth fill:#BD10E0,stroke:#8B0AA8,color:#fff
    style Email fill:#50E3C2,stroke:#2E8B7D,color:#fff
    style Storage fill:#B8E986,stroke:#7FA000,color:#fff
```

### How to Read This Diagram

This is the highest-level view of the system. It shows:
- **Who** uses the system (hosts, guests, admins)
- **What** they do with it (register, manage, view)
- **Where** data flows externally (OAuth, email, storage)

The arrows show information flowing between actors and the system.

### Important Observations

1. **Three types of users**: System must handle different roles/permissions
2. **External dependencies**: System relies on OAuth (authentication), Email (communication), Storage (exports)
3. **Single application**: All users access the same Evenregman system
4. **Bi-directional communication**: System both receives input and sends output

### Questions to Test Your Understanding

1. Why does the system need external OAuth instead of managing auth internally?
2. What would happen if the email service goes down?
3. Why is cloud storage needed separately from the database?
4. How does the system know if a user is a host vs guest vs admin?
5. Can a single person have multiple roles simultaneously?

---

## 2. Container Diagram

```mermaid
graph TB
    User["👤 User<br/>(Browser)"]
    
    SPA["Frontend<br/>Next.js SPA<br/>React"]
    SSE["SSE Connection<br/>(Real-time)"]
    
    API["Backend<br/>Next.js API Routes<br/>Node.js"]
    
    Auth["Auth Middleware<br/>JWT/Session"]
    Cache["L1 Cache<br/>Redis<br/>(Sessions,<br/>Hot Data)"]
    MemCache["L2 Cache<br/>Node Memory<br/>(Event Cache)"]
    
    DB["Primary DB<br/>MongoDB<br/>(Events,<br/>Registrations,<br/>Audit Logs)"]
    
    CDCWorker["CDC Worker<br/>Change Stream<br/>Listener"]
    AnalyticsDB["Analytics DB<br/>MongoDB<br/>Analytics<br/>TimeSeries"]
    
    CSVWorker["CSV Export Worker<br/>Async Job<br/>Queue"]
    NotifWorker["Notification Worker<br/>Email Delivery"]
    
    Queue["Job Queue<br/>(In-memory<br/>or Redis)"]
    
    EmailSvc["Email Service<br/>External"]
    Storage["Storage<br/>External"]
    
    User -->|HTTP/HTTPS| SPA
    User -->|SSE| SSE
    SPA -->|REST API| API
    SSE -->|Events| API
    
    API -->|Check auth| Auth
    API -->|Read/Write| Cache
    API -->|Read/Write| MemCache
    API -->|Primary CRUD| DB
    
    CDCWorker -->|Read Oplog| DB
    CDCWorker -->|Write Analytics| AnalyticsDB
    
    API -->|Enqueue| Queue
    CSVWorker -->|Dequeue| Queue
    NotifWorker -->|Dequeue| Queue
    
    CSVWorker -->|Upload| Storage
    NotifWorker -->|Send| EmailSvc
    
    API -->|Query Analytics| AnalyticsDB
    
    style SPA fill:#61AFFE,stroke:#2E5C8A,color:#fff
    style API fill:#61AFFE,stroke:#2E5C8A,color:#fff
    style Auth fill:#F5A623,stroke:#C17F1E,color:#fff
    style Cache fill:#BD10E0,stroke:#8B0AA8,color:#fff
    style MemCache fill:#BD10E0,stroke:#8B0AA8,color:#fff
    style DB fill:#50E3C2,stroke:#2E8B7D,color:#fff
    style AnalyticsDB fill:#50E3C2,stroke:#2E8B7D,color:#fff
    style CDCWorker fill:#F8E71C,stroke:#C17F1E,color:#000
    style CSVWorker fill:#F8E71C,stroke:#C17F1E,color:#000
    style NotifWorker fill:#F8E71C,stroke:#C17F1E,color:#000
    style Queue fill:#FF6B6B,stroke:#CC5555,color:#fff
    style EmailSvc fill:#7ED321,stroke:#5FA000,color:#fff
    style Storage fill:#7ED321,stroke:#5FA000,color:#fff
```

### How to Read This Diagram

Containers are the major deployable units:
- **Frontend**: What users see (React app)
- **Backend**: Where logic runs (API)
- **Databases**: Where data lives (MongoDB primary + analytics)
- **Workers**: Async processing (CDC, CSV, notifications)
- **Caches**: Performance layer (Redis + memory)

Lines show data/communication flowing between containers.

### Important Observations

1. **Two databases**: Primary MongoDB for operational data, separate for analytics (CDC pattern)
2. **Two caches**: Redis (L1, persistent) + Memory (L2, local) for performance
3. **Multiple workers**: Decoupled from main API (CDC, CSV export, notifications)
4. **Queue in middle**: Decouples requests from long-running jobs
5. **External services**: Email and storage are outside, reducing dependencies

### Questions to Test Your Understanding

1. Why have two separate databases (primary + analytics)?
2. What happens if the Redis cache goes down?
3. Why run CSV export as a separate worker instead of in the API?
4. How does the frontend know when a CSV export completes?
5. What data goes into L1 cache vs L2 cache?
6. Why use Server-Sent Events instead of just polling?

---

## 3. Component Diagram - Core Application

```mermaid
graph TB
    API["API Routes<br/>REST Endpoints"]
    
    Auth["Auth Service<br/>JWT/Session<br/>Validation"]
    
    RegService["Registration Service<br/>Seat Management<br/>Atomic Operations"]
    EventService["Event Service<br/>CRUD Operations"]
    PermService["Permission Service<br/>RBAC/ABAC<br/>Authorization"]
    
    AtomicRes["Atomic<br/>Reservation<br/>Engine"]
    CircuitBreaker["Circuit Breaker<br/>Fault Tolerance"]
    
    RegRepo["Registration<br/>Repository<br/>Data Access"]
    EventRepo["Event<br/>Repository"]
    UserRepo["User<br/>Repository"]
    AuditRepo["Audit Log<br/>Repository"]
    
    CacheLayer["Cache Layer<br/>L1: Redis<br/>L2: Memory"]
    
    Validator["Input<br/>Validator"]
    
    DB["MongoDB<br/>(Primary)"]
    
    API --> Auth
    API --> Validator
    API --> RegService
    API --> EventService
    API --> PermService
    
    RegService --> AtomicRes
    RegService --> CircuitBreaker
    RegService --> RegRepo
    
    EventService --> EventRepo
    PermService --> PermRepo
    
    RegRepo --> CacheLayer
    EventRepo --> CacheLayer
    UserRepo --> CacheLayer
    
    CacheLayer --> DB
    AuditRepo --> DB
    
    PermService --> UserRepo
    PermService --> EventRepo
    
    style API fill:#61AFFE,stroke:#2E5C8A,color:#fff
    style Auth fill:#F5A623,stroke:#C17F1E,color:#fff
    style RegService fill:#4A90E2,stroke:#2E5C8A,color:#fff
    style EventService fill:#4A90E2,stroke:#2E5C8A,color:#fff
    style PermService fill:#4A90E2,stroke:#2E5C8A,color:#fff
    style AtomicRes fill:#FF6B6B,stroke:#CC5555,color:#fff
    style CircuitBreaker fill:#FF6B6B,stroke:#CC5555,color:#fff
    style RegRepo fill:#50E3C2,stroke:#2E8B7D,color:#fff
    style EventRepo fill:#50E3C2,stroke:#2E8B7D,color:#fff
    style UserRepo fill:#50E3C2,stroke:#2E8B7D,color:#fff
    style AuditRepo fill:#50E3C2,stroke:#2E8B7D,color:#fff
    style CacheLayer fill:#BD10E0,stroke:#8B0AA8,color:#fff
    style Validator fill:#F8E71C,stroke:#C17F1E,color:#000
    style DB fill:#50E3C2,stroke:#2E8B7D,color:#fff
```

### How to Read This Diagram

Components are logical groupings within the backend:
- **Service layer**: Business logic (Registration, Event, Permission services)
- **Repository layer**: Data access (hiding database details)
- **Cross-cutting concerns**: Auth, validation, caching, circuit breaker
- **Persistence**: Database as the foundation

### Important Observations

1. **Layered architecture**: API → Services → Repositories → Database
2. **Cross-cutting concerns**: Auth and validation applied to all API routes
3. **Atomic operations**: Special handling for reservations (atomic engine)
4. **Fault tolerance**: Circuit breaker for external/risky operations
5. **Cache before DB**: All data access goes through cache first
6. **Repository pattern**: Data access abstracted from business logic

### Questions to Test Your Understanding

1. Why have a separate PermService instead of checking permissions in each service?
2. What does the Repository pattern buy us?
3. When would the CircuitBreaker trigger?
4. How does the Validator prevent bad data from entering?
5. Why separate atomic reservation logic into its own component?

---

## 4. Dependency Diagram

```mermaid
graph LR
    API["API Routes"]
    
    Auth["Auth<br/>Service"]
    Reg["Registration<br/>Service"]
    Event["Event<br/>Service"]
    Perm["Permission<br/>Service"]
    
    Atomic["Atomic<br/>Engine"]
    CB["Circuit<br/>Breaker"]
    Cache["Cache<br/>Layer"]
    
    RegRepo["Registration<br/>Repo"]
    EventRepo["Event<br/>Repo"]
    
    DB["MongoDB"]
    Redis["Redis"]
    
    API --> Auth
    API --> Reg
    API --> Event
    API --> Perm
    
    Reg --> Atomic
    Reg --> CB
    Reg --> Cache
    Reg --> RegRepo
    
    Event --> Cache
    Event --> EventRepo
    
    Perm --> Event
    Perm --> RegRepo
    
    RegRepo --> Cache
    EventRepo --> Cache
    
    Cache --> Redis
    Cache --> DB
    
    style API fill:#61AFFE
    style Auth fill:#F5A623
    style Reg fill:#4A90E2
    style Event fill:#4A90E2
    style Perm fill:#4A90E2
    style Atomic fill:#FF6B6B
    style CB fill:#FF6B6B
    style Cache fill:#BD10E0
    style RegRepo fill:#50E3C2
    style EventRepo fill:#50E3C2
    style DB fill:#50E3C2
    style Redis fill:#BD10E0
```

### How to Read This Diagram

Arrows show "depends on" relationships:
- Registration Service depends on Atomic Engine, Cache, etc.
- Everything eventually depends on database

This shows coupling and what changes if one component changes.

### Important Observations

1. **Fan-in to cache**: All data access goes through cache (centralized)
2. **Fan-in to DB**: Single source of truth
3. **Services relatively isolated**: Limited dependencies between them
4. **Cache is critical dependency**: Remove it and everything slows down

### Questions to Test Your Understanding

1. If you change the Cache implementation, what needs updating?
2. What happens if PermService depends on RegService and vice versa (circular)?
3. Which components could be tested in isolation?
4. If you wanted to switch databases, what would need changing?

---

## 5. Registration Request Lifecycle

```mermaid
sequenceDiagram
    participant Guest as Guest<br/>(Browser)
    participant Frontend as Frontend<br/>(React)
    participant API as API Handler
    participant Auth as Auth<br/>Middleware
    participant Validator as Input<br/>Validator
    participant RegService as Registration<br/>Service
    participant Atomic as Atomic<br/>Engine
    participant DB as MongoDB<br/>Session
    participant Audit as Audit<br/>Logger
    participant CDC as CDC<br/>Worker

    Guest->>Frontend: Click "Register"
    Frontend->>API: POST /api/registrations<br/>{seatsRequested, eventId}
    
    API->>Auth: Verify JWT token
    Auth-->>API: ✓ User ID verified
    
    API->>Validator: Validate input
    Validator-->>API: ✓ Input valid
    
    API->>RegService: register(eventId, seats, userId)
    RegService->>Atomic: atomicReservation(...)
    
    Atomic->>DB: startSession()
    Atomic->>DB: Read Event (with lock)
    DB-->>Atomic: Event{registeredCount: 95}
    
    Atomic->>Atomic: Check 95 + 5 <= 100?
    Atomic->>DB: Create Registration
    Atomic->>DB: Update Event.registeredCount
    
    Atomic->>DB: commitTransaction()
    DB-->>Atomic: ✓ Success
    
    Atomic-->>RegService: {status: confirmed}
    RegService->>Audit: Log action
    Audit-->>RegService: ✓ Logged
    
    RegService-->>API: {status: confirmed, id: reg123}
    API-->>Frontend: 200 OK
    Frontend->>Frontend: Optimistic update
    Frontend-->>Guest: ✓ Registered!
    
    par Async
        DB->>CDC: Oplog change stream
        CDC->>CDC: Project to analytics
    end
```

### How to Read This Diagram

This shows the complete journey of a registration request:
1. **Client sends request** with seat count
2. **Auth verified** (is this user authenticated?)
3. **Input validated** (is data valid?)
4. **Service called** (business logic)
5. **Atomic transaction** (ensure no overbooking)
6. **Audit logged** (record what happened)
7. **Response sent** (client sees result)
8. **CDC updates analytics** (in background)

### Important Observations

1. **Authentication first**: Happens before any validation or business logic
2. **Atomic operation**: Lock acquired, capacity checked, writes happen together
3. **Audit logging**: Every action recorded (for compliance)
4. **Async CDC**: Analytics updated after response sent (doesn't block user)
5. **Optimistic update**: Frontend updates immediately (doesn't wait for response)

### Questions to Test Your Understanding

1. What happens if auth fails? (Diagram shows success path)
2. Why does the atomic engine need to lock the Event document?
3. What if 5 guests hit register simultaneously for the last 3 seats?
4. Why log to audit log if the transaction already records what happened?
5. What if CDC worker crashes mid-way through projection?

---

## 6. Data Flow Diagram

```mermaid
graph TB
    Guest["👤 Guest<br/>Registration<br/>Request"]
    
    subgraph "Synchronous Path"
        API["API<br/>Handler"]
        Res["Write<br/>Registration<br/>Document"]
        EventCounter["Update<br/>Event<br/>Counter"]
        Outbox["Write to<br/>Outbox<br/>Pattern"]
    end
    
    subgraph "Async Path - CDC"
        Monitor["Monitor<br/>MongoDB<br/>Oplog"]
        Project["Project<br/>Event"]
        Analytics["Write to<br/>Analytics<br/>Collection"]
    end
    
    subgraph "Query Path - Dashboard"
        Dashboard["Host opens<br/>Dashboard"]
        Query["Query<br/>Analytics"]
        Cache["Check<br/>Cache"]
        Render["Render<br/>Dashboard"]
    end
    
    Guest -->|1. Submit| API
    API -->|2. Create| Res
    API -->|3. Update| EventCounter
    API -->|4. Ensure no lost events| Outbox
    API -->|5. Respond| Guest
    
    Res -->|6. Change event| Monitor
    EventCounter -->|6. Change event| Monitor
    Monitor -->|7. Pick up changes| Project
    Project -->|8. Transform event| Analytics
    
    Dashboard -->|9. Request capacity| Query
    Query -->|10. Check first| Cache
    Cache -->|11. Miss, load from| Analytics
    Analytics -->|12. Return pre-aggregated| Render
    Render -->|13. Show to host| Dashboard
    
    style Guest fill:#7ED321
    style API fill:#61AFFE
    style Res fill:#50E3C2
    style EventCounter fill:#50E3C2
    style Outbox fill:#FF6B6B
    style Monitor fill:#F8E71C
    style Project fill:#F8E71C
    style Analytics fill:#50E3C2
    style Dashboard fill:#61AFFE
    style Query fill:#50E3C2
    style Cache fill:#BD10E0
    style Render fill:#61AFFE
```

### How to Read This Diagram

Numbers show the sequence of data movements:
1. **Guest registers** → API processes synchronously
2. **Data persisted** → Written to database
3. **Outbox ensures safety** → CDC has record of change
4. **CDC worker picks up** → Detects change in oplog
5. **Projects to analytics** → Transforms into query-friendly format
6. **Host queries** → Asks for capacity metrics
7. **Cache checked first** → Fast path
8. **If miss, load from analytics** → Pre-aggregated data is fast

### Important Observations

1. **Two-path design**: Sync for confirmation, async for analytics
2. **Outbox pattern**: Guarantees no lost events between sync and async
3. **Pre-aggregation**: Dashboard doesn't calculate, just queries
4. **Cache layer**: Prevents repeated queries to analytics collection
5. **No blocking**: User gets immediate confirmation, analytics update in background

### Questions to Test Your Understanding

1. Why need Outbox pattern if CDC watches oplog anyway?
2. What's the latency from registration → analytics update? (Unknown - depends on worker polling)
3. Why not query primary registration table for dashboard?
4. What if analytics collection has stale data while CDC is processing?
5. How does cache invalidation work (when does cache refresh)?

---

## 7. Authentication & Authorization Flow

```mermaid
sequenceDiagram
    participant User as User<br/>(Browser)
    participant Frontend as Frontend
    participant AuthAPI as Auth<br/>Endpoint
    participant OAuth as OAuth<br/>Provider
    participant DB as Database
    participant API as Protected<br/>API
    participant PermService as Permission<br/>Service

    User->>Frontend: Click "Login with Google"
    Frontend->>AuthAPI: GET /auth/google/callback?code=...
    
    AuthAPI->>OAuth: Exchange code for token
    OAuth-->>AuthAPI: ID Token + Access Token
    
    AuthAPI->>DB: Find/Create user
    DB-->>AuthAPI: User {id, email, roles}
    
    AuthAPI->>AuthAPI: Create JWT
    AuthAPI-->>Frontend: Set-Cookie: JWT + Redirect
    
    Frontend->>API: GET /api/events<br/>Cookie: JWT
    
    API->>API: Extract JWT from cookie
    API->>API: Verify signature
    API->>API: Extract userId
    
    API->>PermService: checkPermission(userId, 'view_events')
    
    PermService->>DB: Get user roles
    PermService->>DB: Get user attributes
    PermService->>PermService: Evaluate RBAC rules
    PermService->>PermService: Evaluate ABAC rules
    PermService-->>API: ✓ Allowed
    
    API->>API: Execute business logic
    API-->>Frontend: 200 + Events
    
    Frontend-->>User: Display events
```

### How to Read This Diagram

Three phases:
1. **Authentication (Who am I?)**: OAuth login → JWT token created
2. **Authorization (Can I do this?)**: RBAC + ABAC rules evaluated
3. **Resource access**: If allowed, return data

### Important Observations

1. **OAuth for login**: Delegates to external provider (Google, etc)
2. **JWT for subsequent requests**: Stateless, cookie-based
3. **Permission check per request**: Not just at login time
4. **Two types of checks**: RBAC (role-based) + ABAC (attribute-based)
5. **Database lookups**: Roles and attributes come from DB

### Questions to Test Your Understanding

1. Why use OAuth instead of username/password?
2. Why JWT instead of session-based (server-side stored tokens)?
3. What if a user's role changes mid-session?
4. How does ABAC differ from RBAC?
5. Why check permissions on every request instead of just at login?
6. What if the user deletes their Google account?

---

## 8. Database Entity-Relationship Diagram

```mermaid
erDiagram
    USER ||--o{ EVENT : creates
    USER ||--o{ REGISTRATION : makes
    USER ||--o{ AUDIT_LOG : creates
    
    EVENT ||--o{ REGISTRATION : has
    EVENT ||--o{ SEAT : contains
    
    REGISTRATION ||--o{ AUDIT_LOG : creates_entry_on
    
    REGISTRATION ||--o{ CAPACITY_SNAPSHOT : tracks
    EVENT ||--o{ CAPACITY_SNAPSHOT : records_in
    
    ANALYTICS_TIMESERIES ||--o{ EVENT : summarizes

    USER {
        ObjectId _id
        string email PK
        string passwordHash
        string[] roles
        Date createdAt
        Date updatedAt
    }

    EVENT {
        ObjectId _id PK
        string name
        string description
        ObjectId hostId FK
        int totalCapacity
        int registeredCount
        int waitlistedCount
        Date startDate
        Date endDate
        string status
        Date createdAt
    }

    REGISTRATION {
        ObjectId _id PK
        ObjectId eventId FK
        ObjectId userId FK
        string guestName
        string guestEmail
        int seatsRequested
        string status
        Date createdAt
        Date confirmedAt
        Date cancelledAt
    }

    SEAT {
        ObjectId _id PK
        ObjectId eventId FK
        int seatNumber
        string status
        ObjectId registrationId FK
    }

    AUDIT_LOG {
        ObjectId _id PK
        ObjectId userId FK
        string action
        string resourceType
        ObjectId resourceId
        object changes
        Date timestamp
        string ipAddress
    }

    CAPACITY_SNAPSHOT {
        ObjectId _id PK
        ObjectId eventId FK
        Date timestamp
        int registeredCount
        int waitlistedCount
    }

    ANALYTICS_TIMESERIES {
        ObjectId _id PK
        string eventType
        Date hourBucket
        object dimensions
        object metrics
        Date createdAt
    }
```

### How to Read This Diagram

- **Boxes** represent tables/collections
- **Lines** show relationships (one-to-many, etc)
- **Inside boxes**: Important fields with types
- **PK**: Primary key (unique identifier)
- **FK**: Foreign key (reference to another table)

### Important Observations

1. **Denormalized counters**: Event has registeredCount + waitlistedCount (not calculated from registrations)
2. **Audit log is append-only**: Records every action, never updated
3. **SEAT table**: Explicit seat allocation (can query "which seat is booked")
4. **ANALYTICS_TIMESERIES**: Pre-aggregated (separate from operational data)
5. **CAPACITY_SNAPSHOT**: History of capacity changes (for trending)
6. **No direct SEAT.user**: Seats reference registrations, not users

### Questions to Test Your Understanding

1. Why denormalize registeredCount instead of always calculating it?
2. Why have separate ANALYTICS_TIMESERIES instead of querying registrations?
3. What's the difference between REGISTRATION and SEAT tables?
4. How would you query "all guests at event X"?
5. How would you query "all events user Y attended"?
6. If a registration is cancelled, does its seat entry get deleted?

---

## 9. Sequence Diagrams - Five Core Operations

### 9A. Guest Registration for Event

```mermaid
sequenceDiagram
    participant Guest
    participant Frontend
    participant API
    participant DB
    participant CDC
    participant Dashboard

    Guest->>Frontend: Click register for event
    Frontend->>API: POST /api/registrations
    API->>DB: Start transaction + lock event
    DB-->>API: Lock acquired
    API->>DB: Read event.registeredCount
    DB-->>API: 95 registered (capacity 100)
    API->>DB: 95 + 5 <= 100? Yes
    API->>DB: Create registration doc
    API->>DB: Update event.registeredCount to 100
    API->>DB: Commit transaction
    DB-->>API: Success
    API-->>Frontend: {confirmed, id: reg123}
    Frontend-->>Guest: "Registration confirmed!"
    
    par Async
        DB->>CDC: Change detected
        CDC->>DB: Write to analytics
    end
    
    Dashboard->>DB: Query analytics
    DB-->>Dashboard: Updated metrics
    Dashboard-->>Dashboard: Re-render
```

### 9B. Host Views Real-Time Dashboard

```mermaid
sequenceDiagram
    participant Host
    participant Frontend
    participant Dashboard
    participant API
    participant Cache
    participant DB

    Host->>Frontend: Open /premium dashboard
    Frontend->>Dashboard: Render component
    
    Dashboard->>API: useSystemHealth()
    API->>Cache: Get health metrics
    Cache-->>API: Miss
    API->>DB: Calculate metrics
    DB-->>API: {cdcSync: 'synced', cb: 'closed'}
    API->>Cache: Store metrics
    API-->>Dashboard: Metrics data
    
    Dashboard->>API: useRegistrations(eventId)
    API->>Cache: Get registrations
    Cache-->>API: Hit (page 1)
    API-->>Dashboard: Registrations
    
    Dashboard->>API: Open SSE /sse/audit
    API-->>Dashboard: Connection opened
    API-->>Dashboard: Stream audit events
    
    Dashboard-->>Host: Render with real-time updates
    
    par Polling
        Dashboard->>API: Every 30s: healthcheck
        API-->>Dashboard: Updated metrics
        Dashboard-->>Host: Re-render if changed
    end
    
    par SSE
        API->>Dashboard: Audit event: "registration"
        Dashboard-->>Dashboard: Add to list
        Dashboard-->>Host: Update audit trail
    end
```

### 9C. Host Cancels a Registration

```mermaid
sequenceDiagram
    participant Host
    participant Frontend
    participant API
    participant Atomic
    participant DB
    participant Audit

    Host->>Frontend: Click cancel on registration
    Frontend->>API: PUT /api/registrations/reg123/cancel
    
    API->>Atomic: cancelRegistration(regId)
    Atomic->>DB: Start transaction
    
    Atomic->>DB: Read registration
    DB-->>Atomic: {status: confirmed, eventId, seats: 5}
    
    Atomic->>DB: Read event
    DB-->>Atomic: {registeredCount: 100}
    
    Atomic->>DB: Update registration.status = cancelled
    Atomic->>DB: Update event.registeredCount = 95
    
    Atomic->>DB: Check waitlist (first waiting)
    DB-->>Atomic: {guestId: user2, seats: 3}
    
    Atomic->>DB: Move user2 to confirmed
    Atomic->>DB: Update event.waitlistedCount = 2
    
    Atomic->>DB: Commit
    DB-->>Atomic: Success
    
    Atomic->>Audit: Log cancellation + promotion
    Audit-->>Atomic: Logged
    
    Atomic-->>API: {cancelled, promoted: user2}
    API-->>Frontend: 200 OK
    Frontend-->>Host: Show success
    
    par Notifications
        API->>API: Queue email for reg owner
        API->>API: Queue email for promoted guest
    end
```

### 9D. CSV Export Initiated

```mermaid
sequenceDiagram
    participant Host
    participant Frontend
    participant API
    participant Queue
    participant Worker
    participant Storage
    participant DB

    Host->>Frontend: Click export registrations
    Frontend->>API: POST /api/jobs/export
    
    API->>DB: Verify permission
    DB-->>API: OK (host owns event)
    
    API->>API: Create job {status: pending}
    API->>Queue: Enqueue job
    
    API-->>Frontend: {jobId: job123, status: pending}
    Frontend-->>Host: "Export started"
    
    Frontend->>API: Poll GET /api/jobs/job123
    API-->>Frontend: {status: pending, progress: 0}
    
    par Worker Processing
        Queue->>Worker: Dequeue job123
        Worker->>DB: Query registrations (stream)
        DB-->>Worker: First 1000 rows
        Worker->>Worker: Format as CSV
        Worker-->>Worker: progress = 10%
        
        loop While rows remain
            Worker->>DB: Next batch
            DB-->>Worker: Rows
            Worker->>Worker: Append to CSV
        end
        
        Worker->>Storage: Upload CSV
        Storage-->>Worker: URL: https://...file.csv
        
        Worker->>DB: Update job.status = completed
        Worker->>DB: Set job.downloadUrl
        
        Worker-->>Worker: Finished
    end
    
    Frontend->>API: Poll /api/jobs (detects completed)
    API-->>Frontend: {status: completed, downloadUrl}
    Frontend-->>Host: Show download link
    Host->>Storage: Click link, download file
```

### 9E. CDC Pipeline Processing

```mermaid
sequenceDiagram
    participant OpLog as MongoDB<br/>OpLog
    participant CDCWorker as CDC<br/>Worker
    participant Outbox as Outbox<br/>Table
    participant Analytics as Analytics<br/>Collection
    participant Dashboard as Dashboard<br/>Query

    Note over OpLog,Dashboard: Registration Created

    OpLog->>OpLog: New registration record
    OpLog->>OpLog: Write change to oplog

    Note over CDCWorker: Every 5 seconds...

    CDCWorker->>OpLog: Query changes since last token
    OpLog-->>CDCWorker: [{type: insert, doc: registration}]

    CDCWorker->>Outbox: Check if already processed
    Outbox-->>CDCWorker: Not found

    CDCWorker->>CDCWorker: Project event:
    CDCWorker->>CDCWorker: Extract dimensions: {eventId, guestRegion}
    CDCWorker->>CDCWorker: Calculate metrics: {count: 1, seats: 5}

    CDCWorker->>Analytics: Upsert analytics doc
    Analytics-->>CDCWorker: Updated

    CDCWorker->>Outbox: Mark as processed
    Outbox-->>CDCWorker: Marked

    CDCWorker->>CDCWorker: Save resume token

    Note over Dashboard: Host queries dashboard

    Dashboard->>Dashboard: useCapacity(eventId)
    Dashboard->>Analytics: Query {eventId, hourBucket}
    Analytics-->>Dashboard: {count: 150, seats: 450}
    Dashboard-->>Dashboard: Fast response!
```

---

## 10. Deployment Architecture

```mermaid
graph TB
    subgraph "Client Layer"
        Browser["🌐 User Browser<br/>Next.js SPA<br/>(React)"]
        Mobile["📱 Mobile Browser<br/>Responsive App"]
    end
    
    subgraph "CDN"
        CDN["☁️ CDN<br/>Static Assets<br/>JS, CSS, Images"]
    end
    
    subgraph "Application Servers"
        LB["⚙️ Load Balancer<br/>HTTP/HTTPS"]
        Server1["Node.js Server 1<br/>Next.js<br/>API Routes"]
        Server2["Node.js Server 2<br/>Next.js<br/>API Routes"]
        Server3["Node.js Server 3<br/>Next.js<br/>API Routes"]
    end
    
    subgraph "Cache Layer"
        Redis["🔴 Redis Cluster<br/>L1 Cache<br/>Sessions"]
    end
    
    subgraph "Worker Nodes"
        CDC["CDC Worker<br/>Change Streams"]
        CSV["CSV Worker<br/>Exports"]
        Notify["Notification Worker<br/>Email"]
    end
    
    subgraph "Data Layer"
        PrimaryDB["📊 MongoDB Primary<br/>Events, Registrations<br/>Users, Audit"]
        ReplicaDB["📊 MongoDB Replica<br/>Read-Only<br/>Analytics queries"]
        AnalyticsDB["📊 Analytics MongoDB<br/>Pre-aggregated<br/>Dashboard queries"]
    end
    
    subgraph "External Services"
        OAuth["🔐 OAuth Provider<br/>Google/Okta/etc"]
        Email["📧 Email Service<br/>SendGrid/SES"]
        Storage["☁️ Cloud Storage<br/>S3/GCS<br/>CSV Files"]
    end
    
    subgraph "Monitoring & Logging"
        Logs["📝 Logging<br/>CloudWatch/ELK"]
        Metrics["📈 Metrics<br/>Prometheus/Datadog"]
        Alerts["🔔 Alerts<br/>PagerDuty"]
    end
    
    Browser -->|HTTPS| CDN
    Browser -->|HTTPS| LB
    Mobile -->|HTTPS| CDN
    Mobile -->|HTTPS| LB
    
    LB -->|Round Robin| Server1
    LB -->|Round Robin| Server2
    LB -->|Round Robin| Server3
    
    Server1 -->|Read/Write| Redis
    Server2 -->|Read/Write| Redis
    Server3 -->|Read/Write| Redis
    
    Server1 -->|Query/Insert| PrimaryDB
    Server2 -->|Query/Insert| PrimaryDB
    Server3 -->|Query/Insert| PrimaryDB
    
    PrimaryDB -->|Replication| ReplicaDB
    PrimaryDB -->|Oplog| CDC
    
    CDC -->|Write| AnalyticsDB
    CSV -->|Read| PrimaryDB
    Notify -->|Read| PrimaryDB
    
    Server1 -->|Queue jobs| CDC
    Server1 -->|Queue jobs| CSV
    Server1 -->|Queue jobs| Notify
    
    ReplicaDB -->|Read| Server1
    ReplicaDB -->|Read| Server2
    ReplicaDB -->|Read| Server3
    
    Server1 -->|Query| AnalyticsDB
    Server2 -->|Query| AnalyticsDB
    Server3 -->|Query| AnalyticsDB
    
    Server1 -->|OAuth| OAuth
    Server2 -->|OAuth| OAuth
    Server3 -->|OAuth| OAuth
    
    Notify -->|Send| Email
    CSV -->|Upload| Storage
    
    Server1 -->|Ship| Logs
    Server2 -->|Ship| Logs
    Server3 -->|Ship| Logs
    CDC -->|Ship| Logs
    
    Server1 -->|Emit| Metrics
    Redis -->|Emit| Metrics
    PrimaryDB -->|Emit| Metrics
    
    Metrics -->|Trigger| Alerts
    Logs -->|Alert on errors| Alerts
    
    style Browser fill:#61AFFE
    style Mobile fill:#61AFFE
    style CDN fill:#7ED321
    style LB fill:#F5A623
    style Server1 fill:#4A90E2
    style Server2 fill:#4A90E2
    style Server3 fill:#4A90E2
    style Redis fill:#BD10E0
    style CDC fill:#F8E71C
    style CSV fill:#F8E71C
    style Notify fill:#F8E71C
    style PrimaryDB fill:#50E3C2
    style ReplicaDB fill:#50E3C2
    style AnalyticsDB fill:#50E3C2
    style OAuth fill:#FF6B6B
    style Email fill:#7ED321
    style Storage fill:#7ED321
    style Logs fill:#9B9B9B
    style Metrics fill:#9B9B9B
    style Alerts fill:#FF6B6B
```

### How to Read This Diagram

Layers show separation of concerns:
1. **Client layer**: Where users access from
2. **CDN**: Fast delivery of static files
3. **Application layer**: Where logic runs (horizontally scaled)
4. **Cache layer**: Shared Redis (survives app restarts)
5. **Worker nodes**: Async processing
6. **Data layer**: MongoDB (primary + replicas)
7. **External services**: Outside our control
8. **Monitoring**: Observe system health

### Important Observations

1. **Horizontal scaling**: Multiple app servers behind load balancer
2. **Shared cache**: Redis cluster used by all servers (not in-process)
3. **Replica database**: Read queries can go to replica (reduces load)
4. **Worker separation**: Long-running tasks don't block API
5. **Analytics separate**: Dedicated MongoDB for dashboard queries
6. **Monitoring built-in**: All components ship metrics/logs
7. **External dependencies**: OAuth, email, storage are not our problem

### Questions to Test Your Understanding

1. Why have both primary and replica databases?
2. What happens if a single app server crashes?
3. Why not store sessions in app memory (would lose on restart)?
4. How does the load balancer know which server to send to?
5. Why separate analytics MongoDB from primary database?
6. What happens if Redis crashes?
7. How many servers do you need based on traffic?
8. Where would rate limiting happen (which layer)?

---

## Summary: What These Diagrams Reveal

### Architecture Principles Demonstrated

1. **Layered separation**: API → Services → Repositories → Database
2. **Caching strategy**: Multiple layers (L1 Redis, L2 memory, query cache)
3. **Async processing**: Workers decoupled from main API
4. **Event-driven**: CDC pipeline for analytics
5. **Fault tolerance**: Circuit breaker, retries, graceful degradation
6. **Scalability**: Horizontal scaling of application servers
7. **Data consistency**: Atomic operations, audit logging
8. **Security**: Authentication (OAuth) + Authorization (RBAC/ABAC)

### Key Design Decisions Visible

| Decision | Why | Evidence |
|----------|-----|----------|
| CDC for analytics | Query-time aggregation would be slow | Separate analytics DB exists |
| Two caches | Redis for shared state, memory for local | Both present in architecture |
| Atomic transactions | Prevent overbooking | Atomic engine component exists |
| OAuth | Don't manage passwords | OAuth provider in diagrams |
| Workers separate | Long tasks shouldn't block API | Queue + workers in architecture |
| Audit logging | Compliance + debugging | Audit table in ER diagram |
| Denormalized counters | Fast capacity checks | registeredCount on Event |

---

## How to Use These Diagrams

### For Learning
- Read 1-10 in order to understand system depth
- Each diagram builds on previous understanding
- Questions test your comprehension

### For Design Decisions
- When adding a feature, which diagram changes?
- If you don't know which diagram to change, you don't understand the architecture

### For Communication
- Show context diagram to non-technical stakeholders
- Show container diagram to engineers
- Show sequence diagrams for complex flows

### For Onboarding
- Context + container = "this is what we build"
- Components + dependencies = "how it works internally"
- Sequences = "what happens when X"
- Deployment = "where it runs"

---

**Next Steps**: 
- Print these diagrams
- Draw them by hand (learning activity)
- Modify them if you find errors
- Use as reference when reading code

These diagrams should match the code. If they don't, either:
1. The code changed (update diagrams)
2. The diagrams were wrong (fix them)
3. Technical debt exists (fix the code)
