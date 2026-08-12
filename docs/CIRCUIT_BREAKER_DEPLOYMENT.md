# Circuit Breaker Deployment & Rollout Strategy

## Phased Rollout Plan

### Phase 0: Infrastructure (Week 1)

**Configuration**:
```env
ENABLE_CIRCUIT_BREAKER=false
```

**What happens**:
- Circuit breaker code deployed but completely inactive
- Zero impact on existing external service calls
- MongoDB fallback_queue collection created (TTL index)
- Configuration validated at startup

**Success Criteria**:
- No errors in logs related to circuit breaker
- Application starts normally
- Fallback queue collection exists and indexed

---

### Phase 1: Pilot Service - Email Notifications (Week 2)

**Configuration**:
```env
ENABLE_CIRCUIT_BREAKER=true
CIRCUIT_BREAKER_ERROR_THRESHOLD_PERCENTAGE=50
CIRCUIT_BREAKER_VOLUME_THRESHOLD=20
CIRCUIT_BREAKER_RESET_TIMEOUT_MS=30000
```

**What happens**:
- Email notification service wrapped with circuit breaker
- Normal operation: emails sent directly
- Service degradation: emails queued to MongoDB after 50% failure rate
- Queued emails retried on exponential backoff

**Validation**:
- ✅ Email circuit breaker trips at 50% error rate
- ✅ Failed emails queue to `fallback_queue` collection
- ✅ Queue item status: pending → processing → completed
- ✅ Queued emails retry with exponential backoff
- ✅ No impact on other services

**Success Criteria**:
- Email service failures gracefully degrade to queue
- No user-visible errors on email send failure
- Emails retry and eventually deliver
- Fallback queue depth < 10 items under normal load

---

### Phase 2: Critical Services - Payment & Webhooks (Week 3)

**Configuration** (same):
```env
ENABLE_CIRCUIT_BREAKER=true
```

**What happens**:
- Payment service: aggressive preset (70% threshold, stricter)
- Webhook delivery: aggressive preset
- Both services protected with fail-fast and fallback

**Validation**:
- ✅ Payment circuit breaker protects gateway
- ✅ Webhook failures don't cascade to event processing
- ✅ Separate circuit breaker per service (isolation)
- ✅ Fallback queue handles critical operations

**Success Criteria**:
- Payment service resilient to gateway degradation
- Webhook failures don't block event delivery
- No requests back up or exhaust connection pools
- Fallback queue stable

---

### Phase 3: General External APIs (Week 4)

**Configuration** (same):
```env
ENABLE_CIRCUIT_BREAKER=true
```

**What happens**:
- Geocoding API: normal preset
- Third-party integrations: configurable per service
- All external calls protected

**Validation**:
- ✅ Geocoding failures return cached data
- ✅ Third-party API failures queue for retry
- ✅ Application stays responsive under upstream failure
- ✅ Cascading failures prevented

**Success Criteria**:
- System resilient to any single external service failure
- No cascading failures observed
- Fallback queue managed automatically
- Alerting detects problems early

---

## Monitoring

### Key Metrics

```
- Circuit breaker state per service (CLOSED/OPEN/HALF_OPEN)
- Error rate % (failures / total)
- Request count per window
- Fallback queue depth (pending items)
- Queue item age (oldest pending)
- Retry count distribution
```

### Dashboard Panels

```
1. Circuit Breaker States
   - Email: CLOSED (98% success)
   - Payment: CLOSED (99.5% success)
   - Webhooks: CLOSED (97% success)
   - Geocoding: CLOSED (95% success)

2. Fallback Queue Health
   - Pending: 5 items
   - Processing: 0 items
   - Completed (24h): 150 items
   - Failed (24h): 2 items

3. Failure Analysis
   - Email: 2% timeout, 0% errors
   - Payment: 0.5% errors
   - Webhooks: 3% timeout
   - Geocoding: 5% timeout, rate limit
```

### Alerts

```
CRITICAL:
- Circuit breaker OPEN: Upstream service unavailable
- Fallback queue pending > 1000: Persistent failure

HIGH:
- Fallback queue pending > 100: Significant backlog
- Circuit breaker HALF_OPEN: Service recovering

MEDIUM:
- Success rate < 50%: Approaching trip threshold
- Queue item age > 1 hour: Long retry delay
- Failed items > 10 in 24h: Retry exhaustion

LOW:
- Circuit breaker tripped and recovered: Service flapped
- Fallback queue cleanup: Expired items deleted
```

---

## Rollback Procedures

### Immediate Rollback

If critical issue found:

```env
ENABLE_CIRCUIT_BREAKER=false
# Restart app servers
# Circuit breaker disabled, all calls bypass protection
```

Changes take effect on next request.

### Gradual Rollback (Increase Reset Timeout)

If probes failing too frequently:

```env
CIRCUIT_BREAKER_RESET_TIMEOUT_MS=60000  # Double recovery interval
# Wait longer before allowing probe request
```

### Disable Single Service

If specific service causing problems:

```typescript
// Temporarily remove circuit breaker wrapper
// from that service only
```

---

## Troubleshooting

### Circuit Breaker Stuck OPEN

1. Check external service logs: is it actually down?
2. Verify timeout setting: `CIRCUIT_BREAKER_TIMEOUT_MS`
3. Check success rate in logs
4. Manually trigger reset: `resetCircuitBreaker(name)`

### Fallback Queue Growing

1. Check external service: still down?
2. Verify queue retry logic: `nextRetryAt` times
3. Check error messages in queue items
4. Increase max retries or add fallback strategy

### Probe Requests Failing

1. Verify external service is recovered
2. Check network connectivity
3. Verify request format (circuit breaker is passing same request)
4. Increase `CIRCUIT_BREAKER_RESET_TIMEOUT_MS` to wait longer

### High Latency from Circuit Breaker

1. Check rolling window: `CIRCUIT_BREAKER_ROLLING_WINDOW_MS`
2. Verify timeout: `CIRCUIT_BREAKER_TIMEOUT_MS`
3. Profile with tracing enabled
4. Fallback strategy shouldn't add latency

---

## Deployment Checklist

### Pre-Deployment

- [ ] Code reviewed
- [ ] Circuit breaker libraries available
- [ ] Fallback queue collection created
- [ ] TTL index on fallback_queue verified
- [ ] Configuration environment variables set
- [ ] Monitoring and alerts configured
- [ ] Runbooks documented
- [ ] Team trained on circuit breaker behavior
- [ ] Rollback procedures tested

### Phase 0

- [ ] Deploy with `ENABLE_CIRCUIT_BREAKER=false`
- [ ] Verify no startup errors
- [ ] Confirm external calls unchanged

### Phase 1

- [ ] Enable circuit breaker for email
- [ ] Simulate email service failure
- [ ] Verify queue fallback triggers
- [ ] Test queue retry/cleanup
- [ ] Monitor for 48 hours

### Phase 2

- [ ] Enable for payment service
- [ ] Enable for webhooks
- [ ] Test per-service isolation
- [ ] Verify no cross-service impact
- [ ] Monitor for 48 hours

### Phase 3

- [ ] Enable for remaining services
- [ ] Comprehensive failure testing
- [ ] Verify cascading failure prevention
- [ ] Collect metrics and feedback
- [ ] Document lessons learned

---

## Success Criteria

Circuit breaker is production-ready when:

✅ **Phase 0**: Code stable, external calls unaffected  
✅ **Phase 1**: Email service gracefully degrades, queue works  
✅ **Phase 2**: Payment and webhooks protected, isolation verified  
✅ **Phase 3**: System resilient to any single external failure  

Typical timeline: **4 weeks** from deploy to full rollout.

---

## Operations Runbook

### Responding to Tripped Circuit Breaker

**Scenario**: Payment service circuit breaker OPEN

1. **Assess**: Check payment gateway status page
2. **Communicate**: Alert customer if critical
3. **Fallback**: Verify fallback queue accepting payments
4. **Retry**: Increase retry attempts or reduce reset timeout
5. **Monitor**: Watch for recovery and queue processing

### Processing Fallback Queue Manually

```typescript
// Query pending items
const items = await fallbackQueueService.dequeueFallbacks('email-notification', 10);

// Process each manually
for (const item of items) {
  try {
    await manuallyRetry(item);
  } catch (err) {
    console.error('Retry failed:', err);
  }
}
```

### Cleaning Up Fallback Queue

```typescript
// Remove items older than 7 days
const deleted = await fallbackQueueService.cleanupExpired();
console.log(`Deleted ${deleted} expired items`);
```

### Viewing Circuit Breaker Metrics

```typescript
const report = await getCircuitBreakerHealthReport();
console.log(JSON.stringify(report, null, 2));
```
