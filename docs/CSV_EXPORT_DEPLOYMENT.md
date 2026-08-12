# CSV Export Deployment & Rollout Strategy

## Phased Rollout Plan

### Phase 0: Baseline & Testing (Week 1)

**Configuration**:
```env
ENABLE_ASYNC_EXPORTS=false
ASYNC_EXPORTS_WORKER_ENABLED=false
```

**What happens**:
- Async export code deployed but inactive
- Zero impact on existing flows
- Infrastructure can be verified (Redis, S3)
- Prepare monitoring dashboards

**Verification Checklist**:
- ✅ Redis connection stable
- ✅ S3 bucket accessible with credentials
- ✅ Database (MongoDB) has ExportJob collection
- ✅ Sync export endpoint works unchanged
- ✅ No errors in application logs

**Success Criteria**:
- No new errors in logs
- Sync exports complete as before
- All infrastructure accessible

---

### Phase 1: Worker Dry-Run (Week 2)

**Configuration**:
```env
ENABLE_ASYNC_EXPORTS=true
ASYNC_EXPORTS_WORKER_ENABLED=true
```

**What happens**:
- Async export system active
- Export endpoint returns 202 Accepted
- Worker processes jobs in background
- Full monitoring and metrics collection

**Duration**: Minimum 1 week

**Deployment Steps**:

1. Update environment variables:
   ```env
   ENABLE_ASYNC_EXPORTS=true
   ASYNC_EXPORTS_WORKER_ENABLED=true
   ```

2. Restart application server

3. Start export worker:
   ```bash
   npm run worker:export
   ```

4. Verify status endpoint works:
   ```bash
   curl /api/host/events/{eventId}/registrations/export?mode=name_email
   # Should return 202 Accepted
   ```

5. Test small export (< 100 rows):
   ```bash
   # Check job status
   curl /api/jobs/{jobId}
   # Should show: status: "pending" → "processing" → "completed"
   ```

**Monitoring** (every 2 hours):
```bash
# Watch export success rate
curl /api/metrics/jobs | jq '.completed, .failed'

# Check for errors
curl /api/metrics/jobs | jq '.topErrors'

# Monitor latency
curl /api/metrics/jobs | jq '.avgLatencyMs'

# Check row counts
curl /api/metrics/jobs | jq '.avgRowCount'
```

**Testing Scenarios**:
- [ ] Small export (< 100 rows) → completes < 10s
- [ ] Medium export (1k rows) → completes < 30s
- [ ] Large export (10k rows) → completes < 2 min
- [ ] Very large export (100k rows) → completes < 5 min
- [ ] Pre-signed URL works in browser
- [ ] Pre-signed URL expires after 15 minutes
- [ ] Worker handles graceful shutdown (SIGTERM)
- [ ] Job status returns correct progress

**Success Criteria**:
- ✅ 100% of exports complete successfully
- ✅ Average latency < 3 minutes (100k rows)
- ✅ Memory usage stays < 100MB per export
- ✅ Pre-signed URLs work and expire correctly
- ✅ Worker resumes on restart
- ✅ No false positives (all exports are valid)

**If Issues Found**:
- Investigate root cause
- Fix in code
- Redeploy and test again
- Extend Phase 1 duration if needed
- Do NOT proceed to Phase 2 until stable

---

### Phase 2: Soft Enforcement (Week 3)

**Configuration** (same as Phase 1):
```env
ENABLE_ASYNC_EXPORTS=true
ASYNC_EXPORTS_WORKER_ENABLED=true
```

**What happens**:
- Async export system in production
- Monitor closely for issues
- Ready to rollback instantly

**Deployment**:
- No code changes
- Same environment variables
- Just monitor more closely

**Duration**: 1 week

**Monitoring** (every 1 hour):
```bash
# Check success rate
curl /api/metrics/jobs | jq '{completed: .completed, failed: .failed, rate: (.completed / (.completed + .failed))}'

# Check for regressions
curl /api/metrics/jobs | jq '.topErrors'

# Monitor performance
curl /api/metrics/jobs | jq '.avgLatencyMs'
```

**Rollback Trigger** (if any occur):
- ❌ Export success rate drops below 95%
- ❌ User complaints about failed exports
- ❌ Performance regression (latency > 5 min for 100k rows)
- ❌ Redis stability issues
- ❌ S3 errors > 5% of uploads
- ❌ Memory usage > 200MB

**Rollback Procedure** (instant):
```env
ENABLE_ASYNC_EXPORTS=false
# Restart app server
# Workers gracefully drain and stop
# Sync export path resumes
```

**Success Criteria**:
- ✅ Zero user-reported issues
- ✅ Export success rate >= 99%
- ✅ No performance regression
- ✅ All exports complete in expected time

---

### Phase 3: Full Deployment (Week 4+)

**Configuration** (same as Phase 2):
```env
ENABLE_ASYNC_EXPORTS=true
ASYNC_EXPORTS_WORKER_ENABLED=true
```

**What happens**:
- Async export system is stable
- Ongoing monitoring for attacks/issues
- Ability to adjust limits via environment variables

**Maintenance**:
- Monitor metrics weekly
- Track top errors
- Correlate with security incidents
- Adjust limits if needed (no code change, just env vars)

**Monitoring** (weekly):
```bash
# Health check
curl /api/metrics/jobs | jq '.completed'

# Identify trends
curl /api/metrics/jobs | jq '.topErrors'

# Performance baseline
curl /api/metrics/jobs | jq '.avgLatencyMs'
```

**Ongoing Tasks**:
- [ ] Weekly metric reviews
- [ ] Monitor for stuck jobs (older than 1 hour)
- [ ] Check S3 cleanup is working (old exports deleted)
- [ ] Review error logs for patterns
- [ ] Update documentation if limits changed

**Optional: Remove Sync Path** (after 4 weeks stable):
- Once confident in async path
- Remove `exportSyncPath()` function
- Simplify export endpoint
- But keep feature flag for emergency rollback

---

## Deployment Checklist

### Pre-Deployment (Before Phase 0)

- [ ] Code reviewed and tested
- [ ] All tests passing (`npm run test`)
- [ ] Performance benchmarked
- [ ] Documentation complete
- [ ] Monitoring dashboards created
- [ ] Alerting rules configured
- [ ] Runbook prepared for escalation
- [ ] Support team briefed on async exports
- [ ] Database (ExportJob collection) created
- [ ] Redis connection verified
- [ ] S3 bucket and credentials verified

### Phase 0 Deployment

- [ ] Merge code to main branch
- [ ] Deploy with `ENABLE_ASYNC_EXPORTS=false`
- [ ] Verify no errors in logs
- [ ] Confirm sync exports still work
- [ ] Test Redis connectivity
- [ ] Test S3 connectivity
- [ ] Check database ExportJob collection exists
- [ ] Performance baseline captured

### Phase 1 Deployment

- [ ] Update environment variables
- [ ] Restart application server
- [ ] Start export worker (`npm run worker:export`)
- [ ] Test small export (< 100 rows)
- [ ] Test medium export (1k rows)
- [ ] Test large export (10k rows)
- [ ] Verify pre-signed URL works
- [ ] Confirm URL expires after 15 min
- [ ] Monitor metrics for full week
- [ ] Document any issues found

### Phase 2 Deployment

- [ ] No code changes needed
- [ ] Same environment variables
- [ ] Close monitoring (every 1 hour)
- [ ] Check user feedback
- [ ] Watch error rates
- [ ] Have rollback ready
- [ ] Document any issues

### Phase 3 Deployment

- [ ] Same configuration as Phase 2
- [ ] Weekly monitoring
- [ ] Document any adjustments
- [ ] Correlate with security incidents
- [ ] Optional: remove sync path after 4 weeks

---

## Tuning Limits

If you need to adjust performance during any phase:

### Increasing Concurrency (Process More Jobs)

```env
# In worker, change DEFAULT_QUEUE_CONFIG
# Can increase from 2 to 4 concurrent exports
# More concurrency = more resources used
```

### Decreasing Batch Size (Lower Memory)

```env
# In job-queue-config.ts, change batchSize
# From 500 to 250 reduces memory footprint
# But increases CSV processing time
```

### Increasing URL Expiry (More Time to Download)

```typescript
// In worker, change generatePresignedUrl() call
// From 900 seconds to 1800 seconds (30 min)
// But longer window = more security risk
```

---

## Rollback Procedures

### Immediate Rollback (if critical issue)

```env
ENABLE_ASYNC_EXPORTS=false
# Restart app server
# Workers gracefully drain
# Sync export path resumes
```

Takes effect immediately on next request.

### Full Rollback (if code issue)

1. Revert code changes:
   ```bash
   git revert <commit-hash>
   ```

2. Deploy reverted code

3. Restart application

4. Restart worker (will see disabled flag and exit)

5. Verify sync exports working

---

## Monitoring Dashboards

### Dashboard 1: Export Health

```
Panels:
- Exports queued (gauge)
- Exports completed (counter)
- Exports failed (counter)
- Average latency (gauge)
- Top errors (table)
```

### Dashboard 2: Performance

```
Panels:
- Latency over time (line chart)
- Row count distribution (histogram)
- Worker CPU usage (line chart)
- Worker memory usage (line chart)
- S3 upload latency (line chart)
```

### Dashboard 3: Errors

```
Panels:
- Error types (pie chart)
- Error trend (line chart)
- Failed job details (table)
- Retry success rate (gauge)
- S3 error rate (gauge)
```

---

## Alerting Rules

### High Priority

```
ExportJobFailureRate > 5%
  Duration: 15 minutes
  Action: Page on-call, investigate immediately

AverageExportLatency > 5 minutes
  Duration: 30 minutes
  Action: Page on-call, check memory/CPU

RedisDown
  Condition: Connection error
  Action: Page on-call, restart Redis
```

### Medium Priority

```
ExportJobFailures > 10 in last hour
  Action: Log ticket, investigate during business hours

S3UploadErrors > 5%
  Action: Log ticket, verify S3 credentials

AverageRowCount > 500k
  Action: Investigate for export spam
```

### Low Priority

```
ExportJobsQueued > 100
  Action: Monitor, may need more worker concurrency

WorkerMemoryUsage > 150MB
  Action: Review, may need to reduce batch size
```

---

## Performance Targets by Phase

| Phase | Target Success Rate | Target Latency (100k rows) | Max Memory |
|-------|---------------------|-----------------------------|-----------|
| 0 | N/A (sync only) | N/A | N/A |
| 1 | > 99% | < 5 min | < 100MB |
| 2 | >= 99% | < 5 min | < 100MB |
| 3 | >= 99% | < 5 min | < 100MB |

---

## Success Criteria

Export system is ready for full deployment when:

✅ Phase 0: Infrastructure stable, no errors  
✅ Phase 1: Exports complete successfully, right row counts  
✅ Phase 2: No user complaints, error rate < 1%  
✅ Phase 3: Stable in production, metrics healthy  

Typical timeline: **3-4 weeks** from code deploy to full production.

---

## References

- [Async CSV Export Architecture](./ASYNC_CSV_EXPORT.md)
- [Rate Limiting Deployment](./RATE_LIMITING_DEPLOYMENT.md)
- [Atomic Registrations](./ATOMIC_REGISTRATIONS.md)
