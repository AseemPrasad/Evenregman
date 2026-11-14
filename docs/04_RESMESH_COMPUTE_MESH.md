# ⚡ ResMesh: Enterprise AI & Staging Environment Reservation Mesh

ResMesh transforms standard event capacity reservations into an **Infrastructure Control Plane** designed for scarce compute clusters (NVIDIA H100s/A100s), staging preview environments, and ephemeral microservices.

---

## 1. Core Problem: The Zombie Compute Epidemic

In modern engineering teams, costly GPU clusters and cloud staging environments sit idle because:
1. Developers spin up expensive environments and forget to tear them down over the weekend.
2. Teams hoard dedicated static instances "just in case", causing company cloud bills to skyrocket.
3. Multiple automation pipelines (CI/CD, training runs) collide attempting to claim the same environment simultaneously.

---

## 2. The ResMesh Solution

ResMesh treats physical compute clusters as **time-decaying scarce slots** using:
* **Time-to-Live (TTL) Leases**: Leases automatically expire and reclaim resources after a pre-determined duration (e.g. 60 minutes).
* **Cryptographic Access Tokens**: Callers receive a secure bearer token (`rmsh_...`) authorized only for the duration of the lease.
* **Self-Healing Sweeper Daemons**: A background worker audits leases every 60 seconds and atomically restores vacated slots to Redis and MongoDB.
* **Hourly Dollar Burn Tracking**: Continuous calculation of live fleet dollar burn based on per-resource hourly cost rates.

```mermaid
graph TD
    Dev[Developer / CI Pipeline] -->|Acquire 60m Lease| MeshAPI[/api/mesh/leases]
    MeshAPI -->|Atomic Slot Check| Redis[Redis Lock Layer]
    Redis -->|Grant Slot| DB[(MongoDB Replica Set)]
    DB -->|Emit Bearer Token| Dev
    
    subgraph Self-Healing Cycle
        Reaper[60s Lease Reaper Daemon] -->|Scan leaseExpiresAt <= now| DB
        Reaper -->|Transition status: EXPIRED| DB
        Reaper -->|Increment Available Slots| Redis
        Reaper -->|Purge L2 Cache| Cache[Cache Invalidation]
    end
```

---

## 3. Data Model Polymorphism

ResMesh reuses the hardened, battle-tested registration pipeline via polymorphic model extensions:

### 3.1 Resource Abstraction (`Event` Model)
When an `Event` represents an infrastructure resource:
```typescript
{
  kind: "RESOURCE",
  resourceType: "GPU_CLUSTER", // or "STAGING_ENV", "TEST_RUNNER"
  capacity: 8,                  // e.g. 8 available H100 GPU nodes
  attendeeCount: 3,             // 3 currently leased nodes
  hourlyCostRate: 24.50,        // $24.50 / hour per node
  status: "OPEN"
}
```

### 3.2 Compute Lease Abstraction (`Registration` Model)
When a `Registration` represents a time-bound compute lease:
```typescript
{
  kind: "LEASE",
  status: "ACTIVE",            // "ACTIVE", "EXPIRED", "RELEASED"
  leaseStartedAt: ISODate("2026-11-14T18:00:00Z"),
  leaseExpiresAt: ISODate("2026-11-14T19:00:00Z"),
  leaseToken: "rmsh_98e1f02c7b5a41d9..."
}
```

---

## 4. The 60-Second Background Lease Reaper

Located at `src/lib/mesh/lease-reaper.ts` and managed by the container worker bootstrap (`src/workers/bootstrap.ts`):

1. **Query**: Finds up to 50 active leases where `leaseExpiresAt <= new Date()`.
2. **ACID Transaction**:
   - Updates `Registration.status = "EXPIRED"`.
   - Decrements `Event.attendeeCount` by 1.
   - If the pool was `FULL`, transitions status back to `OPEN`.
3. **Post-Commit Synchronization**:
   - Removes Redis lease key `lease:{resourceId}:{leaseId}`.
   - Resyncs atomic capacity counter via `redisSyncEventCapacity`.
   - Flushes Next.js tags and L2 Redis cache via `revalidateEventCache(resource.slug)`.

---

## 5. Live Fleet Telemetry & Burn Rate Metrics

Calculated dynamically in `src/lib/mesh/mesh-analytics.ts`:

$$\text{Utilization \%} = \left( \frac{\sum \text{Occupied Slots}}{\sum \text{Total Slots}} \right) \times 100$$

$$\text{Active Burn Rate (\$/hr)} = \sum_{i=1}^{N} \text{Lease}_i.\text{hourlyCostRate}$$

This telemetry is rendered live in the ResMesh Developer Control Plane at `/mesh` and emitted as an SSE audit stream at `/api/mesh/sse/audit`.

