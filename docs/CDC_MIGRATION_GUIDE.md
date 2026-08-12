# CDC Analytics Pipeline Migration Guide

## Quick Start: Using Analytics Metrics

### Get Host Dashboard Metrics

**Before** (On-demand aggregation):
```typescript
import { getHostDashboardData } from '@/lib/dashboard';

const data = await getHostDashboardData(hostId);
// Runs $group on operational database
```

**After** (CDC-aware, automatic fallback):
```typescript
// No code change needed!
// If CDC enabled: uses pre-aggregated analytics
// If CDC disabled: falls back to on-demand

const data = await getHostDashboardData(hostId);
```

**What it does**:
- Checks if CDC enabled
- If yes: queries AnalyticsTimeSeries (< 100ms)
- If no: runs aggregation as fallback
- Zero breaking changes

---

## Adding New Analytics Metrics

### Register Event Type Projection

**Before**: No analytics tracking
```typescript
// In src/lib/cdc-projection.ts, add:
import { cdcProjectionEngine } from '@/lib/cdc-projection';

cdcProjectionEngine.registerProjection({
  eventType: 'myEventType',
  dimensions: ['eventId', 'hostId', 'customField'],
  metricFields: ['amount', 'processingTime'],
});
```

**What it does**:
- Tells CDC worker which fields to track
- Extracts dimensions for filtering
- Calculates metrics: sum, count, avg
- Creates hourly aggregates

### Add Metric Calculation Function

```typescript
// In src/lib/analytics-metrics.ts, add:
async function calculateMyEventMetrics(eventId: string): Promise<any> {
  const results = await AnalyticsTimeSeriesModel.aggregate([
    {
      $match: {
        eventType: 'myEventType',
        'dimensions.eventId': eventId,
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$metrics.count' },
        average: { $avg: '$metrics.amount' },
      },
    },
  ]);

  return results[0] || { total: 0, average: 0 };
}
```

---

## Testing CDC Pipeline

### Simulate Event Processing

```typescript
import { cdcWorker } from '@/workers/cdc-worker';
import { cdcProjectionEngine } from '@/lib/cdc-projection';

// Simulate insert event
const changeEvent = {
  operationType: 'insert',
  fullDocument: {
    _id: 'test-123',
    eventId: 'event-456',
    hostId: 'host-789',
    amount: 99.99,
    createdAt: new Date(),
  },
  resumeToken: 'token-xyz',
};

// Project event
await cdcProjectionEngine.projectEvent(changeEvent, 'myevents');

// Verify in analytics collection
const result = await AnalyticsTimeSeriesModel.findOne({
  'dimensions.eventId': 'event-456',
});

console.log('Projected:', result);
```

### Test Resume Token Recovery

```typescript
import { resumeTokenManager } from '@/lib/cdc-resume-token';

// Save token
await resumeTokenManager.saveToken('registrations', 'token-123');

// Load token (should be fresh)
const token = await resumeTokenManager.loadToken('registrations');
console.log('Retrieved token:', token);

// Verify it's stored
const stored = await AnalyticsTimeSeriesModel.collection.db.collection('cdc_resume_tokens').findOne({
  collectionName: 'registrations'
});
console.log('Stored:', stored);
```

### Verify Projection Idempotency

```typescript
// Project same event twice
const event = {
  operationType: 'insert',
  fullDocument: { _id: '123', amount: 50 },
  resumeToken: 'token-same',
};

await cdcProjectionEngine.projectEvent(event, 'sales');
await cdcProjectionEngine.projectEvent(event, 'sales');

// Count should be 1, not 2 (upsert pattern)
const count = await AnalyticsTimeSeriesModel.countDocuments();
console.log('Count (should be 1):', count);
```

---

## Backfilling Historical Data

### One-Time Backfill Script

```typescript
import { AnalyticsTimeSeriesModel } from '@/models/AnalyticsTimeSeries';
import { RegistrationModel } from '@/models/Registration';

async function backfillRegistrationMetrics() {
  const registrations = await RegistrationModel.find().lean();

  console.log(`Backfilling ${registrations.length} registrations...`);

  let processed = 0;

  for (const reg of registrations) {
    const hourBucket = new Date(reg.createdAt);
    hourBucket.setMinutes(0, 0, 0);

    await AnalyticsTimeSeriesModel.updateOne(
      {
        eventType: 'registration',
        hourBucket: hourBucket.toISOString(),
        'dimensions.eventId': reg.eventId,
      },
      {
        $inc: { 'metrics.count': 1 },
        $set: {
          processed: true,
          updatedAt: new Date(),
        },
      },
      { upsert: true },
    );

    processed++;
    if (processed % 1000 === 0) {
      console.log(`Processed: ${processed}/${registrations.length}`);
    }
  }

  console.log('Backfill complete!');
}
```

---

## Monitoring CDC Health

### Check Pipeline Status

```typescript
import { getCDCMetricsEndpoint, getCDCAlerts } from '@/lib/cdc-metrics';

const health = await getCDCMetricsEndpoint();

console.log(`Enabled: ${health.enabled}`);
console.log(`Healthy: ${health.healthy}`);
console.log(`Issues: ${health.issues.join(', ')}`);
console.log(`Events/min: ${health.metrics.eventsPerMinute}`);
console.log(`Avg latency: ${health.metrics.averageLatencyMs}ms`);
console.log(`Analytics size: ${health.metrics.analyticsCollectionSize} documents`);
```

### Set Up Monitoring Dashboard

```typescript
// Expose CDC metrics endpoint
// GET /api/metrics/cdc

import { getCDCMetricsEndpoint } from '@/lib/cdc-metrics';

export async function GET() {
  const report = await getCDCMetricsEndpoint();
  return Response.json(report);
}
```

---

## Schema Migration Patterns

### Adding New Dimension

```typescript
// 1. Update projection
cdcProjectionEngine.registerProjection({
  eventType: 'registration',
  dimensions: [
    'eventId', 'hostId', 'region', 'category',
    'source', 'newDimension' // Add here
  ],
});

// 2. CDC worker will project with new dimension on next write
// 3. Old documents won't have it (sparse index)
// 4. Backfill if needed:

await AnalyticsTimeSeriesModel.updateMany(
  { 'dimensions.newDimension': { $exists: false } },
  { $set: { 'dimensions.newDimension': 'unknown' } }
);
```

### Adding New Metric

```typescript
// 1. Update projection
cdcProjectionEngine.registerProjection({
  eventType: 'sale',
  metricFields: ['amount', 'quantity', 'newMetric'], // Add here
});

// 2. New metrics calculated on future writes
// 3. Old documents have sparse metrics

// 4. Calculate for backfill:
await AnalyticsTimeSeriesModel.updateMany(
  { 'metrics.newMetric': { $exists: false } },
  [
    {
      $set: {
        'metrics.newMetric': '$sourceDocument.newMetric'
      }
    }
  ]
);
```

---

## Troubleshooting

### CDC Not Processing Events

1. Verify `ENABLE_CDC_PIPELINE=true`
2. Check worker is running: `CDC_PIPELINE_WORKER_ENABLED=true`
3. Inspect logs for connection errors
4. Verify MongoDB is replica set (required for change streams)
5. Check change stream permissions

### High Latency from Analytics Queries

1. Verify indexes created: `db.analytics_timeseries.getIndexes()`
2. Check query plan: `explain()` with compound index
3. Monitor analytics collection size
4. Ensure resume token not too old

### Resume Token Stale

1. If > 1 week old, CDC restarts from beginning (catch-up mode)
2. Check oplog size (should be > 2GB)
3. Consider increasing oplog: `rs.change({ oplogSizeMB: 50000 })`
4. Monitor token age: `resumeTokenManager.getMaxTokenAge()`

---

## Migration Checklist

**Phase 1: Monitoring**
- [ ] Set up CDC health dashboard
- [ ] Configure alerts for errors/latency
- [ ] Verify resume token storage

**Phase 2: Testing**
- [ ] Test event projection
- [ ] Test resume token recovery
- [ ] Test idempotency
- [ ] Load test with production data volume

**Phase 3: Deployment**
- [ ] Enable CDC in staging
- [ ] Verify analytics accuracy
- [ ] Compare analytics vs on-demand queries
- [ ] Monitor for 48 hours

**Phase 4: Production**
- [ ] Enable CDC in production
- [ ] Gradual dashboard migration
- [ ] Monitor performance improvements
- [ ] Set up automated backups

---

## References

- [[CDC_ARCHITECTURE.md]] — System design
- [[CDC_DEPLOYMENT.md]] — Rollout strategy
- [MongoDB Change Streams](https://docs.mongodb.com/manual/changeStreams/)
- [MongoDB Oplog](https://docs.mongodb.com/manual/core/replica-set-oplog/)
