# Real-Time Change Data Capture (CDC) Analytics Event Pipeline

## Overview

**Change Data Capture (CDC)** streams database mutations in real-time to an isolated analytics collection. This eliminates heavy aggregations on the operational database and provides pre-calculated metrics for dashboards and reports.

### Problem Solved

**Before**: Dashboard queries execute $group aggregations directly on operational tables, impacting CRUD performance  
**After**: CDC worker projects changes to analytics collection; dashboard queries read pre-aggregated data from optimized indexes

## Architecture

### Data Flow

```
Database Write (Insert/Update)
  ↓
MongoDB Change Stream (oplog)
  ↓
CDC Worker Listens
  ↓
Event Transformation
  ├─ Extract: userId, eventId, timestamp
  ├─ Normalize: standardize field names, time zones
  └─ Aggregate: bin by hour, calculate metrics
  ↓
Analytics Projection
  ├─ Upsert to AnalyticsTimeSeries collection
  ├─ Save resume token for recovery
  └─ Update metrics: count, sum, avg, percentiles
  ↓
Dashboard Query
  ├─ Read from AnalyticsTimeSeries (index scan)
  ├─ No $group, $match on operational tables
  └─ Response: < 100ms
```

### Components

**CDC Worker** (`src/workers/cdc-worker.ts`):
- Persistent change stream listener
- Registers handlers per collection
- Exponential backoff on connection failures

**Resume Token Manager** (`src/lib/cdc-resume-token.ts`):
- Persistent token storage (Redis/MongoDB)
- Freshness validation (auto-restart if > 1 week old)
- Cache for fast lookups

**Projection Engine** (`src/lib/cdc-projection.ts`):
- Transform raw changes into analytics events
- Dimension extraction: eventId, hostId, region, category
- Hour bucketing for time-series aggregation

**Metrics Calculator** (`src/lib/analytics-metrics.ts`):
- Pre-aggregated query layer
- Hourly registration metrics
- Sales velocity per event
- Geographic breakdown
- Host/event dashboards

**Analytics Collection** (`src/models/AnalyticsTimeSeries.ts`):
- Time-series optimized schema
- Compound indexes for range queries
- TTL cleanup (default: 90 days)
- Idempotent upserts via change token

**Pipeline Runner** (`src/workers/cdc-pipeline-runner.ts`):
- Manages worker lifecycle
- Batch processing: collects N events or waits T ms
- Graceful shutdown: saves resume token
- Signal handling: SIGTERM, SIGINT

**Monitoring** (`src/lib/cdc-metrics.ts`):
- Performance metrics: events/min, latency, errors
- Health checks: enabled, running, error rate
- Alerts: high latency, idle time, staleness

## Configuration

### Environment Variables

```env
# Feature Flag
ENABLE_CDC_PIPELINE=false

# Worker Execution
CDC_PIPELINE_WORKER_ENABLED=false

# Batch Processing
CDC_BATCH_SIZE=100                      # Events per batch
CDC_BATCH_INTERVAL_MS=5000              # Max wait time

# Resume Token
CDC_RESUME_TOKEN_STORAGE=redis          # redis or mongodb
CDC_MAX_RESUME_TOKEN_AGE_SECONDS=604800 # 1 week

# Output
CDC_ANALYTICS_COLLECTION=analytics_timeseries

# Error Handling
CDC_ERROR_RETRY_DELAY_MS=5000           # Backoff delay
```

## Performance Characteristics

| Operation | Target | Notes |
|-----------|--------|-------|
| Change detection | < 50ms | MongoDB oplog | 
| Event transformation | < 20ms | Extraction + normalization |
| Batch projection | < 50ms | 100 events to analytics |
| Dashboard query | < 100ms | Index scan (no aggregation) |
| Resume token save | < 10ms | On-demand write |

## Supported Event Types

- **registration**: User registration for events
- **checkin**: Check-in/attendance tracking
- **sale**: Ticket/merchandise sales
- **refund**: Refund processing

## Pre-Calculated Metrics

### Hourly Metrics
- Count: events per hour
- Sum: total sales per hour
- Average: average ticket price
- Min/Max: price range
- Percentiles: p50, p95, p99 latencies

### Dashboard Metrics
- Total registrations (per host, per event)
- Check-in count and rate
- Total revenue
- Average revenue per registration
- Geographic distribution

### Time Windows
- 1-hour buckets: fine-grained trends
- 24-hour aggregates: daily performance
- 7-day trends: weekly analysis

## Backward Compatibility

✅ **Zero Breaking Changes**:
- Feature flag defaults to false
- Existing dashboard queries still work
- Operational DB untouched when CDC disabled
- Fallback to on-demand aggregation if needed

✅ **Coexistence**:
- CDC and on-demand queries can coexist
- Gradual migration: enable per-event-type
- No schema changes to operational tables

## Idempotency & Durability

✅ **Idempotent Processing**:
- Same change token → same projection
- Duplicate events → same final state
- Safe retry: projecting twice = same result

✅ **Resume Token Reliability**:
- Saved after each batch processed
- Restart from token on failure
- Fallback to beginning if token too old

✅ **No Event Loss**:
- Change stream guarantees ordering
- Resume token prevents gaps
- Batch saves before processing next

## References

- [[CDC_DEPLOYMENT.md]] — Rollout strategy
- [[CDC_MIGRATION_GUIDE.md]] — Usage examples
- [MongoDB Change Streams](https://docs.mongodb.com/manual/changeStreams/)
