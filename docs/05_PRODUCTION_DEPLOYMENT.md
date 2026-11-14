# 🚀 Production Deployment & Scaling Guide

This guide covers deployment topologies, process isolation, Kubernetes/Docker architectures, and strict infrastructure requirements for live production.

---

## 1. Process Decoupling Architecture

Never run background workers and Next.js web traffic inside the same Node.js OS process. The application is designed to be deployed as **two isolated container targets** built from the single multi-stage `Dockerfile`:

```mermaid
graph LR
    LB[Load Balancer / Ingress] --> Web1[Container Target: web]
    LB --> Web2[Container Target: web]
    
    subgraph Background Daemons
        Worker1[Container Target: worker]
        Worker2[Container Target: worker]
    end
    
    Web1 --> Mongo[(MongoDB Atlas Replica Set)]
    Web2 --> Mongo
    Worker1 --> Mongo
    
    Web1 --> Redis[(Redis Cluster)]
    Worker1 --> Redis
```

### 1.1 Web Process (`target: web`)
* **Command**: `npm start` (Runs Next.js 15 on port 3000).
* **Responsibilities**: Handles user browser requests, serves Server Actions, authenticates sessions, evaluates L1 Redis fast-path capacity checks.
* **Scaling**: Horizontal auto-scaling (HPA) based on HTTP request count / CPU utilization.

### 1.2 Worker Process (`target: worker`)
* **Command**: `ts-node src/workers/bootstrap.ts`.
* **Responsibilities**:
  1. **Outbox Relay**: Polls `outbox_events` and dispatches external calls.
  2. **ResMesh Lease Reaper**: Executes 60s sweeper cycle for expired compute leases.
  3. **Export Worker**: Dequeues async CSV export jobs from BullMQ/Redis and streams rows to AWS S3.
  4. **CDC Pipeline**: Change stream projections for real-time analytics.
* **Scaling**: Run 2+ replicas with leader election / atomic document claiming for high availability.

---

## 2. Infrastructure Topology Prerequisites

### 2.1 MongoDB: Replica Set Required (`replSet`)
> [!IMPORTANT]
> A standalone single-node MongoDB instance will fail. Multi-document transactions (`session.withTransaction`) and Change Streams (`cdcWorker`) require an active replica set.
* **Recommended Hosted Option**: **MongoDB Atlas (Tier M10+)**.
* **Self-Hosted Option**: Configure a minimum 3-node replica set (`rs0`) with primary, secondary, and arbiter.
* **Connection String Format**:
  `mongodb://user:pass@mongo1:27017,mongo2:27017,mongo3:27017/evenregman?replicaSet=rs0&authSource=admin`

### 2.2 Redis: Persistence & Memory Sizing
* **Minimum Redis Version**: 7.0+
* **Persistence Configuration**:
  - `appendonly yes`
  - `appendfsync everysec`
* **Maxmemory Policy**:
  - `maxmemory-policy volatile-lru` or `allkeys-lru`
  - Keep capacity keys (`event:{id}:capacity`) persistent with TTLs rather than allowing Redis to randomly evict them.

---

## 3. Production Docker Compose Configuration

```yaml
version: "3.8"

services:
  web:
    build:
      context: .
      target: web
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - MONGODB_URI=mongodb://rs0-1:27017,rs0-2:27017/evenregman?replicaSet=rs0
      - REDIS_URL=redis://redis:6379
      - AUTH_SECRET=${AUTH_SECRET}
      - ENABLE_ATOMIC_REGISTRATIONS=true
      - ENABLE_L2_CACHE=true
    depends_on:
      - redis
    restart: always

  worker:
    build:
      context: .
      target: worker
    environment:
      - NODE_ENV=production
      - MONGODB_URI=mongodb://rs0-1:27017,rs0-2:27017/evenregman?replicaSet=rs0
      - REDIS_URL=redis://redis:6379
      - OUTBOX_RELAY_ENABLED=true
      - ASYNC_EXPORTS_WORKER_ENABLED=true
      - ENABLE_ASYNC_EXPORTS=true
      - MESH_LEASE_REAPER_ENABLED=true
      - ENABLE_EMAIL_DISPATCH=true
      - AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
      - AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
      - S3_BUCKET_NAME=${S3_BUCKET_NAME}
    depends_on:
      - redis
    restart: always
```

---

## 4. Health Checks & Readiness Probes

| Container Target | Probe Type | Check Path / Command |
|---|---|---|
| **Web** | Liveness | `GET /` (HTTP 200) |
| **Web** | Readiness | `GET /api/metrics/cache` (Verifies Redis & DB connectivity) |
| **Worker** | Liveness | Container process alive (`pgrep -f "bootstrap.ts"`) |
| **Worker** | Health Telemetry | `GET /api/metrics/outbox` (Audits pending vs failed queue depth) |

