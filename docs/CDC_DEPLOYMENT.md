# CDC Analytics Pipeline Deployment & Rollout Strategy

## Phased Rollout Plan

### Phase 0: Infrastructure (Week 1)

**Configuration**:
```env
ENABLE_CDC_PIPELINE=false
CDC_PIPELINE_WORKER_ENABLED=false
```

**What happens**:
- CDC code deployed but completely inactive
- Analytics collection created and indexed
- Resume token storage configured
- Zero impact on operational database

**Success Criteria**:
- Analytics collection exists with indexes
- No CDC errors in logs
- Dashboard queries still work (on-demand path)

---

### Phase 1: Pilot - Registration Analytics (Week 2)

**Configuration**:
```env
ENABLE_CDC_PIPELINE=true
CDC_PIPELINE_WORKER_ENABLED=true
CDC_BATCH_SIZE=100
CDC_BATCH_INTERVAL_MS=5000
```

**What happens**:
- CDC worker starts watching registration changes
- Events projected to analytics collection
- Dashboard queries can optionally use analytics
- On-demand aggregation still available as fallback

**Validation**:
- ✅ Change stream detects registration inserts/updates
- ✅ Events projected to AnalyticsTimeSeries < 100ms
- ✅ Resume token saved after batch processing
- ✅ Metrics query returns pre-aggregated data
- ✅ Dashboard fallback works if analytics unavailable

**Success Criteria**:
- Zero dropped events
- Processing latency < 100ms
- Fallback queries successful
- No operational DB impact

---

### Phase 2: Extended Analytics - Check-ins & Sales (Week 3)

**Configuration** (same):
```env
ENABLE_CDC_PIPELINE=true
CDC_PIPELINE_WORKER_ENABLED=true
```

**What happens**:
- CDC expanded to track check-ins and sales
- Multi-event-type analytics available
- Host dashboard queries optimized
- Dashboard metrics calculations available

**Validation**:
- ✅ All event types (registration, checkin, sale) projected
- ✅ Metrics queries returning aggregates
- ✅ Host dashboard using analytics
- ✅ Geographic breakdown available

**Success Criteria**:
- All event types in analytics
- No lag between write and analytics availability
- Dashboard responsive (< 100ms)
- Analytics collection stable size

---

### Phase 3: Production Stable (Week 4+)

**Configuration** (stable):
```env
ENABLE_CDC_PIPELINE=true
CDC_PIPELINE_WORKER_ENABLED=true
```

**What happens**:
- CDC pipeline fully stable
- Analytics primary for dashboards
- Continuous monitoring and optimization
- Periodic backfill/cleanup tasks

---

## Monitoring

### Key Metrics

```
- Events processed (total and per minute)
- Average latency (ms)
- Error count
- Resume token age (seconds)
- Analytics collection size (MB)
- Dashboard query latency (ms)
```

### Alerts

```
CRITICAL:
- Error rate > 1% of events
- Latency > 1000ms

HIGH:
- No events processed in 5 minutes
- Resume token stale (> 1 week old)
- Average latency > 500ms

MEDIUM:
- Events per minute declining
- Analytics collection > 5GB

LOW:
- Batch processing time trending up
- Queries to operational DB still happening
```

---

## Rollback Procedures

### Immediate Rollback

If critical issue found:

```env
ENABLE_CDC_PIPELINE=false
CDC_PIPELINE_WORKER_ENABLED=false
# Restart worker
# Dashboard falls back to on-demand aggregation
```

Takes effect on next query.

### Partial Rollback

If specific event type problematic:

```typescript
// Comment out projection registration for that type
// cdcProjectionEngine.registerProjection({ eventType: 'sale', ... })
```

---

## Troubleshooting

### No Events Being Processed

1. Check `ENABLE_CDC_PIPELINE=true`
2. Check `CDC_PIPELINE_WORKER_ENABLED=true`
3. Verify MongoDB change streams support (replica set required)
4. Check logs for connection errors
5. Verify worker process is running

### High Latency

1. Check batch size: `CDC_BATCH_SIZE`
2. Check batch interval: `CDC_BATCH_INTERVAL_MS`
3. Monitor Analytics collection size (may need indexing)
4. Check MongoDB oplog size (if < 2GB, may miss events)
5. Profile projection logic

### Stale Resume Token

1. If token > 1 week old, CDC restarts from beginning
2. Check `CDC_MAX_RESUME_TOKEN_AGE_SECONDS`
3. Monitor token age in metrics
4. Consider increasing oplog size if frequent stalls

### Analytics Collection Growing Too Fast

1. Check TTL cleanup: `createdAt: 1` with 90-day expiry
2. Review retention requirements
3. Adjust `CDC_BATCH_SIZE` if too aggressive
4. Consider archiving old metrics

---

## Deployment Checklist

### Pre-Deployment

- [ ] Code reviewed
- [ ] CDC libraries tested
- [ ] Analytics indexes verified
- [ ] Resume token storage configured
- [ ] Monitoring dashboard created
- [ ] Fallback paths tested
- [ ] Rollback procedure documented

### Phase 0

- [ ] Deploy with CDC disabled
- [ ] Analytics collection created
- [ ] Indexes created successfully
- [ ] No errors in logs

### Phase 1

- [ ] Enable CDC pipeline
- [ ] Simulate registration writes
- [ ] Verify projection to analytics
- [ ] Check resume token saving
- [ ] Monitor for 48 hours

### Phase 2

- [ ] Expand to multiple event types
- [ ] Test cross-event aggregations
- [ ] Verify metrics calculations
- [ ] Update dashboard queries

### Phase 3

- [ ] Full production rollout
- [ ] Continuous monitoring
- [ ] Regular backups of analytics collection
- [ ] Periodic cleanup tasks

---

## Success Criteria

CDC pipeline is production-ready when:

✅ **Phase 0**: Collection created, indexes verified, no impact  
✅ **Phase 1**: Single event type projected, zero latency issues  
✅ **Phase 2**: Multi-event analytics stable  
✅ **Phase 3**: Dashboard uses analytics as primary source  

Typical timeline: **4 weeks** from deploy to full production.

---

## Operations Runbook

### Responding to CDC Worker Crash

1. Check logs for error
2. Verify MongoDB connectivity
3. Check replica set status
4. Restart worker (auto-restarts from saved token)
5. Monitor recovery latency

### Manual Resume Token Reset

```typescript
import { resumeTokenManager } from '@/lib/cdc-resume-token';
await resumeTokenManager.clearAllTokens();
// Worker restarts from beginning on next change
```

### Monitoring CDC Health

```typescript
import { getCDCMetricsEndpoint, getCDCAlerts } from '@/lib/cdc-metrics';

const health = await getCDCMetricsEndpoint();
const alerts = await getCDCAlerts();

console.log(JSON.stringify(health, null, 2));
console.log('Alerts:', alerts);
```

### Cleaning Analytics Collection

```typescript
import { AnalyticsTimeSeriesModel } from '@/models/AnalyticsTimeSeries';

// Delete events older than 90 days (TTL handles this auto)
// Or manual cleanup:
await AnalyticsTimeSeriesModel.deleteMany({
  createdAt: { $lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) }
});
```
