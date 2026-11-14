<p align="center">
  <img src="./docs/assets/resmesh-banner.svg" alt="evenregman // ResMesh Banner" width="100%" />
</p>

<p align="center">
  <a href="https://nextjs.org/"><img src="https://img.shields.io/badge/Next.js-15.5.29-000000?style=for-the-badge&logo=next.js&logoColor=white" alt="Next.js 15" /></a>
  <a href="https://react.dev/"><img src="https://img.shields.io/badge/React-19.3.1-23272f?style=for-the-badge&logo=react&logoColor=61dafb" alt="React 19" /></a>
  <a href="https://www.mongodb.com/"><img src="https://img.shields.io/badge/MongoDB-Replica_Set_ACID-001e2b?style=for-the-badge&logo=mongodb&logoColor=00ed64" alt="MongoDB" /></a>
  <a href="https://redis.io/"><img src="https://img.shields.io/badge/Redis-Lua_Atomic_Locks-1e1e1e?style=for-the-badge&logo=redis&logoColor=dc382d" alt="Redis" /></a>
  <a href="https://aws.amazon.com/s3/"><img src="https://img.shields.io/badge/AWS-S3_SigV4-232f3e?style=for-the-badge&logo=amazon-aws&logoColor=ff9900" alt="AWS S3" /></a>
  <a href="https://stripe.com/"><img src="https://img.shields.io/badge/Stripe-Metered_Billing-0a2540?style=for-the-badge&logo=stripe&logoColor=635bff" alt="Stripe" /></a>
  <a href="https://opentelemetry.io/"><img src="https://img.shields.io/badge/OpenTelemetry-Tracing-24292e?style=for-the-badge&logo=opentelemetry&logoColor=f5a800" alt="OTel" /></a>
</p>

<p align="center">
  <strong>An enterprise-grade, high-throughput dual-engine distributed platform.</strong><br>
  Built on Next.js 15 App Router, Redis Lua in-memory fast-path locking, MongoDB Replica Set ACID transactions, and a Transactional Outbox relay.
</p>

<p align="center">
  <a href="#-dual-engine-architecture">Dual Engines</a> •
  <a href="#-feature-matrix-bento-grid">Bento Matrix</a> •
  <a href="#-why-this-architecture">Architecture Highlights</a> •
  <a href="#-interactive-concurrency-lifecycle">Concurrency Flow</a> •
  <a href="#-live-concurrency-stress-test-terminal">Terminal Proof</a> •
  <a href="#-developer-quickstart--api-recipes">API Recipes</a> •
  <a href="#-complete-documentation-hub">Documentation Hub</a>
</p>

---

## 🏛️ Dual-Engine Architecture

<p align="center">
  <img src="./docs/assets/dual-engine-cards.svg" alt="evenregman vs ResMesh Cards" width="100%" />
</p>

---

## 🍱 Feature Matrix (Bento Grid)

<p align="center">
  <img src="./docs/assets/bento-features.svg" alt="Bento Feature Architecture Grid" width="100%" />
</p>

---

## ⚡ Why This Architecture?

Traditional web applications and naive CRUD clones fail catastrophically under burst traffic. Here is how `evenregman // ResMesh` compares against standard implementations:

| Operational Dimension | Standard Web Apps / Naive CRUD | `evenregman // ResMesh` Engine |
|---|---|---|
| **Peak Concurrency** | ❌ Vulnerable to TOCTOU race conditions; database locks oversell seats | ⚡ **Atomic Redis Lua L1 Lock**: Sub-ms in-memory decrement with **zero overselling guarantee** |
| **Data Consistency** | ❌ Dual-write anomalies: external network call succeeds while DB write fails | 🛡️ **Transactional Outbox**: Business mutations & event records commit in the same atomic session |
| **Cloud Environments** | ❌ Zombie environments run indefinitely, hoarding massive cloud bills | ⏳ **Self-Healing TTL Leases**: 60s background sweeper daemon atomically reclaims slots |
| **Enterprise Identity** | ❌ Manual employee account creation and spreadsheet rosters | 🏢 **SCIM v2 Protocol**: Automated directory sync with Okta, Azure AD, CyberArk |
| **S3 Export Storage** | ❌ Synchronous CSV creation blocks the HTTP server thread pool | ☁️ **Async AWS SigV4 Streaming**: Background BullMQ workers with JIT pre-signed download URLs |
| **Revenue & Monetization** | ❌ Static credit card forms with flat subscription tiers | 💳 **Stripe Metered Billing**: Automated usage reporting based on live hourly compute burn rate |

---

## 🔄 Interactive Concurrency Lifecycle

How a reservation request travels from a user click to an atomic commit without database contention:

```mermaid
sequenceDiagram
    autonumber
    actor Client as User / Automation Client
    participant App as Next.js 15 Server Action
    participant Redis as Redis L1 (In-Memory Lua)
    participant Mongo as MongoDB Replica Set (ACID L2)
    participant Outbox as Transactional Outbox
    participant Daemon as Background Relay Worker
    participant Cloud as Cloud Services (AWS / Stripe / SMTP)

    Client->>App: POST /events/[slug]/register or /api/mesh/leases
    Note over App,Redis: Step 1: Sub-millisecond fast-path check
    App->>Redis: EVALSHA redisCheckAndDecrement
    alt Capacity Exhausted (Counter <= 0)
        Redis-->>App: 0 (Capacity Depleted)
        App-->>Client: 409 Conflict ("Event Sold Out / Pool Full")
    else Slot Reserved (Counter > 0)
        Redis-->>App: Remaining Capacity Count
        Note over App,Mongo: Step 2: Multi-Document ACID Session
        App->>Mongo: session.withTransaction()
        Mongo->>Mongo: Create Registration / Lease Entity
        Mongo->>Mongo: Increment Attendee / Occupied Counter
        Mongo->>Outbox: Insert OutboxEvent (Status: PENDING)
        Mongo-->>App: Transaction Committed Successfully
        App-->>Client: 201 Created (Ticket ID / Bearer Token Granted)
    end

    Note over Outbox,Daemon: Step 3: Asynchronous Guaranteed Delivery
    loop Continuous Polling Loop
        Daemon->>Outbox: findOneAndUpdate({ status: 'PENDING' }, { $set: { status: 'PROCESSING' } })
        Daemon->>Cloud: Deliver SMTP Email / Upload S3 CSV / Report Stripe Meter
        alt Operation Succeeded
            Daemon->>Outbox: updateOne({ status: 'COMPLETED' })
        else Operation Failed
            Daemon->>Outbox: Exponential Backoff (Attempt N/5)
        end
    end
```

---

## 🖥️ Live Concurrency Stress Test (Terminal Proof)

When 50 parallel asynchronous workers target a scarce resource with only 5 remaining seats simultaneously:

<p align="center">
  <img src="./docs/assets/terminal-concurrency.svg" alt="Terminal Concurrency Stress Test Output" width="100%" />
</p>

---

## 💻 Developer Quickstart & API Recipes

### 1. Acquire a Compute Lease via SDK / API
```typescript
// Client-side or Automation script
const response = await fetch("https://resmesh.io/api/mesh/leases", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    resourceId: "65b4c9e8f1a23c0012a45b67",
    leaseDurationMinutes: 60
  })
});

const lease = await response.json();
console.log(lease.leaseToken); // rmsh_a8f9c1e402b8d77a94ef113098
console.log(lease.expiresAt);  // 2026-11-14T19:00:00.000Z (Auto-reclaimed in 60m)
```

### 2. Poll Asynchronous CSV Export Job (JIT S3 Pre-signed URL)
```bash
# Trigger Export
curl -X POST https://resmesh.io/api/host/events/xyz/registrations/export \
  -H "Content-Type: application/json" \
  -d '{"mode":"detailed"}'

# Response: { "jobId": "exp_8f1a23", "status": "queued" }

# Poll Status (JIT Refreshed AWS SigV4 URL)
curl https://resmesh.io/api/jobs/exp_8f1a23
# Response: { "status": "completed", "downloadUrl": "https://bucket.s3.amazonaws.com/xyz.csv?X-Amz-Signature=..." }
```

---

## 📚 Complete Documentation Hub

The project includes an extensive, enterprise-grade documentation suite located in [`docs/`](./docs):

| Guide | Description |
|---|---|
| [**01. System Overview**](./docs/01_SYSTEM_OVERVIEW.md) | Business model, COSS architecture, high-level subsystem breakdown. |
| [**02. Architecture Deep Dive**](./docs/02_ARCHITECTURE_DEEP_DIVE.md) | Concurrency mechanics, Lua scripts, transactional outbox, and CDC projections. |
| [**03. Complete API Reference**](./docs/03_API_REFERENCE.md) | Full route catalog, SCIM v2 specifications, Stripe webhooks, and SSE feeds. |
| [**04. ResMesh Compute Mesh**](./docs/04_RESMESH_COMPUTE_MESH.md) | Infrastructure abstraction, bearer tokens, lease lifecycles, and burn tracking. |
| [**05. Production Deployment**](./docs/05_PRODUCTION_DEPLOYMENT.md) | Kubernetes, multi-target Dockerfile, MongoDB Atlas replica set requirements. |
| [**06. Environment & Security Matrix**](./docs/06_ENV_VARS_AND_SECURITY.md) | Master reference for all 42 configuration options and multi-role RBAC matrices. |
| [**07. SRE Operations & Runbooks**](./docs/07_OPERATIONS_AND_RUNBOOKS.md) | Real-world incident playbooks: Redis restarts, outbox replays, and oplog rollovers. |

---

## ⚡ 60-Second Quickstart (Local Infrastructure)

### 1. Start Local Infrastructure
The system requires a MongoDB replica set (`rs0`) and Redis. These are configured out-of-the-box in Docker Compose:
```bash
docker compose up -d rs0 redis
```

### 2. Install & Configure
```bash
pnpm install
cp .env.example .env.local
```

### 3. Launch Development Server
```bash
pnpm dev
```
Visit `http://localhost:3000` for the ticketing portal, or `http://localhost:3000/mesh` for the ResMesh Control Plane.

### 4. Launch Background Daemons
In a dedicated terminal, run the outbox relay, lease reaper, export worker, and CDC pipeline runner:
```bash
pnpm worker
```

---

## 🛡️ License

This project is licensed under the Apache 2.0 / MIT Dual License - see the [LICENSE](LICENSE) file for details.
