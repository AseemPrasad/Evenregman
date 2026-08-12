# L2 Cache Deployment & Rollout Strategy

## Phased Rollout Plan

### Phase 0: Infrastructure & Testing (Week 1)

**Configuration**:
```env
ENABLE_L2_CACHE=false
CACHE_COMPRESSION_ENABLED=true
```

**What happens**:
- Redis connection configured but not used
- Cache code deployed but completely inactive
- Zero impact on existing flows
- Infrastructure can be verified

**Verification Checklist**:
- ✅ Redis connection successful
- ✅ Cache service methods tested
- ✅ Compression working correctly
- ✅ Metrics endpoint functional
- ✅ No errors in application logs

**Success Criteria**:
- All infrastructure ready
- No performance degradation
- Feature flag proven disabled

---

### Phase 1: Read-Only Audit (Week 2)

**Configuration**:
```env
ENABLE_L2_CACHE=true
CACHE_COMPRESSION_ENABLED=true
```

**What happens**:
- Cache populates on all queries
- Metrics collected (hits, misses, hit rate)
- Database remains authoritative
- No enforcement (cache optional)
- Validate cache correctness

**Deployment**:

1. **Update environment variables**:
   ```env
   ENABLE_L2_CACHE=true
   ```

2. **Restart application server**

3. **Monitor cache metrics** (every 2 hours):
   ```bash
   curl /api/metrics/cache | jq '.cache'
   # Expected: hit rate climbing 0% → 50%+
   ```

4. **Verify data correctness**:
   - Sample cache hits vs database queries
   - Confirm identical data returned
   - No stale data observed

**Testing Scenarios**:
- [ ] Event detail pages cached
- [ ] Event list cached
- [ ] Cache TTL expiry working
- [ ] Compression producing savings
- [ ] No corrupted data in cache
- [ ] High concurrency handled

**Monitoring** (every 2 hours):
```bash
# Check hit rate
curl /api/metrics/cache | jq '.cache | {hits, misses, hitRate}'

# Check compression
curl /api/metrics/cache | jq '.compression | {averageCompressionRatio, bytesSaved}'

# Verify no errors
curl /api/metrics/cache | jq '.cache.errors'  # Should be 0
```

**Success Criteria**:
- ✅ Hit rate climbing steadily
- ✅ No data corruption detected
- ✅ Compression working (> 40% ratio)
- ✅ Zero cache errors
- ✅ Database queries proceeding normally

**If Issues Found**:
- Investigate root cause
- Fix in staging environment
- Redeploy and test
- Extend Phase 1 if needed

---

### Phase 2: Selective Enforcement (Week 3)

**Configuration** (same as Phase 1):
```env
ENABLE_L2_CACHE=true
```

**What happens**:
- Cache now used for reads (not optional)
- High-traffic endpoints benefit most
- Database load visibly drops
- Performance improves significantly

**Deployment**:
- No code changes needed
- Same environment variables
- More aggressive monitoring

**Duration**: 1 week

**Monitoring** (every 4 hours):
```bash
# Track database load reduction
# Monitor endpoint latency
# Check cache hit rate
# Verify invalidation working
```

**Success Criteria**:
- ✅ Database load reduced 50%+
- ✅ Latency improved (P99 < 15ms cached)
- ✅ Hit rate stable (70%+)
- ✅ No stale data
- ✅ Zero user complaints

**Rollback Trigger** (if any):
- ❌ Hit rate drops below 50%
- ❌ Stale data detected
- ❌ Performance regression
- ❌ Cache errors > 1%
- ❌ Redis memory exceeding limits

**Rollback Procedure** (instant):
```env
ENABLE_L2_CACHE=false
# Restart app server
# All reads use database immediately
```

---

### Phase 3: Full Deployment (Week 4+)

**Configuration** (stable):
```env
ENABLE_L2_CACHE=true
CACHE_COMPRESSION_ENABLED=true
```

**What happens**:
- System is stable and performant
- Database load reduced 70-80%
- Response latency significantly improved
- Ongoing monitoring and optimization

**Maintenance**:
- [ ] Weekly metric reviews
- [ ] Monitor cache hit rate trend
- [ ] Track Redis memory usage
- [ ] Review compression ratio
- [ ] Correlate with traffic patterns

**Weekly Tasks**:
```bash
# Check system health
curl /api/metrics/cache | jq '.cache'

# Monitor Redis (via Redis CLI)
INFO stats

# Check for errors
tail -f app.log | grep "\[Cache\]"
```

---

## Data Migration Checklist

### Pre-Deployment

- [ ] Redis instance ready and tested
- [ ] Backup application database
- [ ] Prepare rollback procedure
- [ ] Notify stakeholders
- [ ] Prepare runbooks for on-call

### Phase 0 Deployment

- [ ] Deploy cache infrastructure code
- [ ] Verify Redis connectivity
- [ ] Test cache operations
- [ ] Enable ENABLE_L2_CACHE=false
- [ ] Confirm no impact on existing flows

### Phase 1 Deployment

- [ ] Update ENABLE_L2_CACHE=true
- [ ] Monitor cache population
- [ ] Verify data correctness
- [ ] Collect baseline metrics
- [ ] Document findings

### Phase 2 Deployment

- [ ] Monitor aggressive caching
- [ ] Track database load drop
- [ ] Measure latency improvement
- [ ] Verify invalidation
- [ ] Have rollback ready

### Phase 3 Deployment

- [ ] Declare stable production
- [ ] Remove monitoring escalation
- [ ] Document best practices
- [ ] Plan ongoing optimization

---

## Monitoring Dashboard

### Key Metrics

```
Panel 1: Cache Performance
- Hit Rate (gauge, target > 70%)
- Hits/Misses (line chart)
- P99 Latency (gauge, target < 15ms)
- Cache Writes/Deletes (counter)

Panel 2: Database Impact
- Query Count (line chart, should decrease)
- Query Latency (line chart)
- Connection Pool Usage (gauge)

Panel 3: Compression
- Compression Ratio (gauge, target > 40%)
- Bytes Saved (counter)
- Compression Errors (gauge, target 0)

Panel 4: Redis Health
- Memory Usage (gauge)
- Evictions (counter, should be 0)
- Connection Count (gauge)
- Errors (counter, target 0)
```

### Alerting Rules

```
High Priority:
  CacheErrors > 1%
    Duration: 5 minutes
    Action: Page on-call

  CacheHitRate < 50%
    Duration: 30 minutes
    Action: Investigate

  DatabaseQueriesIncrease > 20%
    Duration: 15 minutes
    Action: Check cache status

Medium Priority:
  LatencyRegression > 10%
    Duration: 30 minutes
    Action: Review metrics

  RedisMemory > 80%
    Duration: 1 hour
    Action: Investigate

Low Priority:
  CacheErrors > 0
    Duration: 1 hour
    Action: Log for analysis
```

---

## Performance Targets by Phase

| Phase | Cache State | Hit Rate | P99 Latency | DB Load Reduction |
|-------|-------------|----------|-------------|-------------------|
| 0 | Disabled | N/A | baseline | 0% |
| 1 | Auditing | 0% → 70% | baseline | 0% |
| 2 | Selective | 70%+ | < 20ms | 50%+ |
| 3 | Full | 70%+ | < 15ms | 70-80% |

---

## Troubleshooting

### Cache Not Populating
**Symptoms**: Hit rate stuck at 0%  
**Diagnosis**:
```bash
curl /api/metrics/cache | jq '.cache'
# Should see increasing writes
```
**Fix**: Check `ENABLE_L2_CACHE=true`, verify Redis connectivity

### High Hit Rate But Slow Response
**Symptoms**: 80% hit rate but latency unchanged  
**Diagnosis**: Compression overhead or Redis latency  
**Fix**: Check compression ratio, Redis network latency

### Stale Data Served
**Symptoms**: Old event data after update  
**Should Never Happen**: Invalidation is synchronous  
**If Occurs**:
1. Immediately set `ENABLE_L2_CACHE=false`
2. Clear Redis manually
3. Investigate invalidation logic
4. Fix and test in staging

### Memory Bloat
**Symptoms**: Redis memory growing unbounded  
**Check**: TTL expiry, compression ratio  
**Fix**: Reduce TTL or compression threshold

---

## Success Criteria

Cache is ready for full production when:

✅ **Phase 0**: Infrastructure stable, no impact  
✅ **Phase 1**: Hit rate > 60%, data matches DB  
✅ **Phase 2**: Hit rate > 70%, latency < 20ms, DB load -50%  
✅ **Phase 3**: Hit rate > 70%, latency < 15ms, DB load -70%  

Typical timeline: **3-4 weeks** from code deploy to full production.

---

## References

- [L2 Cache Architecture](./L2_CACHE_ARCHITECTURE.md)
- [RBAC/ABAC Deployment](./RBAC_DEPLOYMENT.md)
- [CSV Export Deployment](./CSV_EXPORT_DEPLOYMENT.md)
