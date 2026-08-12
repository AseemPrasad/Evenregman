# Rate Limiter Deployment & Rollout Strategy

## Phased Rollout Plan

### Phase 0: Baseline & Testing (Week 1)

**Configuration**:
```env
ENABLE_RATE_LIMITING=false
RATE_LIMIT_STRICT_MODE=false
```

**What happens**:
- Rate limiter code deployed but inactive
- Zero impact on existing flows
- Infrastructure can be verified (Redis, configuration)
- Prepare monitoring dashboards

**Verification**:
- ✅ Redis connection stable
- ✅ Metrics endpoint works
- ✅ No errors in logs

---

### Phase 1: Dry-Run Mode (Week 2)

**Configuration**:
```env
ENABLE_RATE_LIMITING=true
RATE_LIMIT_STRICT_MODE=false
```

**What happens**:
- Rate limiter runs for all configured policies
- **Does NOT block requests** (returns 429 in headers only)
- Logs all violations
- Collects metrics on actual traffic patterns
- Allows tuning of limits

**Duration**: 2 weeks minimum

**Monitoring**:
```bash
# Watch violation patterns
curl https://api.example.com/api/metrics/rate-limit | jq '.violations'

# Identify false positives
curl https://api.example.com/api/metrics/rate-limit | jq '.top_violators'

# Check performance impact
curl https://api.example.com/api/metrics/rate-limit | jq '.performance'
```

**Success Criteria**:
- Violations log matches expected attack patterns
- No legitimate traffic falsely blocked
- Latency impact < 1ms average
- Top violators are clearly malicious

**If Issues**:
- Adjust `max_requests` per policy
- Extend dry-run period
- Investigate false positives

---

### Phase 2: Soft Enforcement (Week 3)

**Configuration**:
```env
ENABLE_RATE_LIMITING=true
RATE_LIMIT_STRICT_MODE=true
```

**What happens**:
- Rate limiter now **blocks requests** (returns 429)
- Returns proper HTTP status and headers
- Clients get Retry-After guidance
- Close monitoring for false positives

**Duration**: 1 week

**Monitoring** (increased frequency):
```bash
# Every hour
curl https://api.example.com/api/metrics/rate-limit | jq '.violations'

# Track error rates
curl https://api.example.com/api/metrics/rate-limit | jq '.top_violators'

# Check if legitimate users affected
# (via support tickets, error logs, user complaints)
```

**Rollback Trigger**:
- Legitimate traffic falsely blocked (> 1% of requests)
- Performance regression (latency > 5ms)
- Redis stability issues
- Unexpected error patterns

**Rollback Procedure**:
```env
RATE_LIMIT_STRICT_MODE=false
# OR
ENABLE_RATE_LIMITING=false
```
Rollback is instant (no restart needed).

---

### Phase 3: Full Deployment (Week 4+)

**Configuration** (stable):
```env
ENABLE_RATE_LIMITING=true
RATE_LIMIT_STRICT_MODE=true
```

**What happens**:
- System is stable and enforcing limits
- Ongoing monitoring for attacks
- Ability to adjust limits without code changes

**Maintenance**:
- Monitor metrics weekly
- Adjust limits if needed (environment variable change)
- Track top violators
- Correlate with security incidents

---

## Deployment Checklist

### Pre-Deployment

- [ ] Code reviewed and tested
- [ ] Performance benchmarked (< 3ms latency)
- [ ] All tests passing
- [ ] Documentation complete
- [ ] Monitoring dashboards created
- [ ] Alerting rules configured
- [ ] Runbook prepared for escalation
- [ ] Support team briefed on 429 responses

### During Phase 0

- [ ] Deploy code with feature flags disabled
- [ ] Verify Redis connectivity
- [ ] Test metrics endpoint
- [ ] Confirm no errors in logs
- [ ] Check performance baseline

### During Phase 1 (Dry-Run)

- [ ] Run for full 2 weeks
- [ ] Collect violation metrics
- [ ] Review top violators
- [ ] Identify legitimate traffic patterns
- [ ] Adjust limits if needed
- [ ] Document findings

### During Phase 2 (Soft Enforcement)

- [ ] Monitor every 2 hours
- [ ] Check for user complaints
- [ ] Watch error rates
- [ ] Have rollback ready
- [ ] Document any issues

### During Phase 3 (Full Deployment)

- [ ] Weekly metric reviews
- [ ] Correlate with security incidents
- [ ] Adjust limits as needed
- [ ] Continue monitoring for attacks

---

## Tuning Limits

If you need to adjust limits during any phase:

### Increasing Limit (fewer blocks)

```env
# Example: increase signin attempts from 10 to 15 per minute
RATE_LIMIT_AUTH_SIGNIN_LIMIT=15
```

Changes take effect immediately on next request (no restart needed).

### Decreasing Limit (tighter security)

```env
# Example: decrease signup from 5 to 3 per minute
RATE_LIMIT_AUTH_SIGNUP_LIMIT=3
```

Existing connections not affected; new requests use new limit.

---

## Metrics Dashboard Queries

### Violations Over Time

```bash
# Polling metrics endpoint
watch -n 60 'curl -s /api/metrics/rate-limit | jq ".violations"'
```

### Top Attackers

```bash
curl /api/metrics/rate-limit | jq '.top_violators | .[0:10]'
```

### Performance Impact

```bash
curl /api/metrics/rate-limit | jq '.performance'
# Should show avg_latency_ms < 3
```

### Policy-Specific Stats

```bash
curl /api/metrics/rate-limit | jq '.violations.by_policy | to_entries | sort_by(.value) | reverse | .[0:5]'
```

---

## Escalation Plan

### Level 1: Elevated Violations (> 100/hour)

1. Check `/api/metrics/rate-limit`
2. Identify which policy is violated
3. Review top violators
4. If legitimate: adjust limit
5. If attack: monitor and log

### Level 2: Performance Regression (latency > 5ms)

1. Check Redis connection
2. Check Redis memory/CPU
3. Check network latency
4. If persistent: reduce poll load or scale Redis

### Level 3: False Positive Blocking (> 1% legitimate traffic)

1. Immediately set `RATE_LIMIT_STRICT_MODE=false`
2. Investigate which policy is too strict
3. Review logs and metrics
4. Adjust limit after analysis
5. Re-enable strict mode

---

## Monitoring Alerts

Set up these alerts in your monitoring system:

```
Alert: RateLimitViolationsHigh
  Condition: violations.total > 100 in last hour
  Action: page on-call, review metrics

Alert: RateLimitLatencyHigh
  Condition: avg_latency_ms > 5
  Action: page on-call, check Redis

Alert: SingleIPAttacking
  Condition: top_violators[0].count > 50 in hour
  Action: log, monitor (don't block unless policy says so)

Alert: RedisDown
  Condition: rate_limiter error rate > 1%
  Action: page on-call, check Redis status
```

---

## Rollback Procedures

### Immediate Rollback (Emergency)

If 429 responses are breaking legitimate users:

```env
RATE_LIMIT_STRICT_MODE=false
```

Or if need complete disable:

```env
ENABLE_RATE_LIMITING=false
```

**No code changes needed.** Changes take effect on next request.

### Full Rollback (If Needed)

1. Set `ENABLE_RATE_LIMITING=false`
2. Wait 5 minutes for connection drain
3. Investigate root cause
4. Fix issue and retest in staging
5. Deploy fix before re-enabling

---

## Success Criteria

Rate limiter is ready for full deployment when:

✅ Phase 0: Infrastructure stable, no errors  
✅ Phase 1: Violation patterns match threat model  
✅ Phase 2: < 1% false positive blocking  
✅ Phase 3: No user complaints, security incidents reduce  

Typical timeline: **3-4 weeks** from code deploy to full enforcement.

---

## References

- [Rate Limiting Architecture](./RATE_LIMITING.md)
- [Monitoring Guide](../docs/RATE_LIMITING.md#monitoring)
- [Performance Characteristics](../docs/RATE_LIMITING.md#performance-characteristics)
