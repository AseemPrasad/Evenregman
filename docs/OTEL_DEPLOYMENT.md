# OpenTelemetry Deployment & Rollout Strategy

## Phased Rollout Plan

### Phase 0: Infrastructure (Week 1)

**Configuration**:
```env
ENABLE_OTEL_TRACING=false
```

**What happens**:
- OTel SDK code deployed but completely inactive
- Zero impact on existing request flows
- Infrastructure verified (SDK initialization, OTLP exporter)
- Documentation reviewed by ops team

**Success Criteria**:
- No errors in logs related to `[OTel]`
- Application starts normally
- Existing request latency unchanged

---

### Phase 1: Local Development (Week 2)

**Configuration**:
```env
ENABLE_OTEL_TRACING=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_SAMPLE_RATE=1.0
```

**What happens**:
- Local dev environment runs with 100% trace sampling
- Jaeger UI accessible at `http://localhost:16686`
- Developers can inspect full trace flows
- Library compatibility verified

**Validation**:
- ✅ HTTP requests appear in Jaeger
- ✅ Database spans nested under HTTP span
- ✅ Cache operations visible
- ✅ Background jobs linked to parent traces
- ✅ Exceptions recorded with stacktraces

**Success Criteria**:
- Full end-to-end traces visible
- No dropped spans
- Sampling working correctly
- Collector connectivity stable

---

### Phase 2: Staging Environment (Week 3)

**Configuration**:
```env
ENABLE_OTEL_TRACING=true
OTEL_EXPORTER_OTLP_ENDPOINT=https://staging-collector.internal/otlp
OTEL_SAMPLE_RATE=0.1
```

**What happens**:
- 10% of requests traced (1 in 10)
- Load test to verify exporter throughput
- Trace volume and storage costs estimated
- Collector performance validated

**Validation**:
- ✅ Trace export latency < 100ms
- ✅ No dropped spans
- ✅ Database queries traced correctly
- ✅ Sampling distributes evenly
- ✅ Error traces complete and useful

**Success Criteria**:
- Trace latency acceptable (< 1ms overhead)
- Storage costs reasonable
- All key operations visible in traces
- No impact on request latency

---

### Phase 3: Production Canary (Week 4)

**Configuration**:
```env
ENABLE_OTEL_TRACING=true
OTEL_EXPORTER_OTLP_ENDPOINT=https://prod-collector.internal/otlp
OTEL_SAMPLE_RATE=0.05
```

**What happens**:
- 5% of production traffic traced
- Real-world latency and error patterns observed
- Collector handles production volume
- Alert thresholds tuned

**Monitoring**:
- Trace export errors
- Collector latency
- Exporter queue depth
- Dropped spans

**Success Criteria**:
- Zero impact on request latency
- < 0.5% of traces dropped
- Traces complete within 10 seconds
- Cost aligned with forecast

---

### Phase 4: Production Ramp (Week 5+)

**Gradual increase**:
```env
Week 1: OTEL_SAMPLE_RATE=0.05  (5%)
Week 2: OTEL_SAMPLE_RATE=0.1   (10%)
Week 3: OTEL_SAMPLE_RATE=0.25  (25%)
Week 4: OTEL_SAMPLE_RATE=1.0   (100%)
```

**What happens**:
- Trace sampling gradually increased
- Collector and storage scaled accordingly
- Alerts refined based on real production patterns
- Team trained on trace analysis

---

## Monitoring

### Key Metrics

```
- Trace export success rate (target: > 99.5%)
- Trace export latency (p95: < 500ms)
- Exporter queue depth (target: < 1000 spans pending)
- Dropped span rate (target: 0%)
- Collector error rate (target: < 0.1%)
```

### Health Checks

```
# Exporter status
logs | grep "[OTel] Error" | count

# Trace completeness
traces_exported - traces_dropped = expected_traces

# Latency impact
api_request_latency with otel_enabled
vs
api_request_latency with otel_disabled
```

### Alerts

```
Alert: OTEL_Export_Failure_Rate > 1%
Alert: OTEL_Dropped_Spans > 100/min
Alert: OTEL_Queue_Depth > 5000
Alert: OTEL_Exporter_Latency_p95 > 1000ms
Alert: OTEL_Collector_Error_Rate > 0.5%
```

---

## Rollback Procedures

### Immediate Rollback

If critical issue found:

```env
ENABLE_OTEL_TRACING=false
# Restart app servers
# Tracing fully disabled, zero overhead
```

Changes take effect immediately.

### Partial Rollback (Reduce Sampling)

If trace volume causing issues:

```env
OTEL_SAMPLE_RATE=0.01  # Drop to 1% sampling
# No restart needed, takes effect on next span
```

---

## Troubleshooting

### Spans Not Appearing

1. Verify `ENABLE_OTEL_TRACING=true`
2. Verify `OTEL_EXPORTER_OTLP_ENDPOINT` is accessible
3. Check logs for `[OTel]` errors
4. Verify collector is receiving connections
5. Check sampling rate: `echo $OTEL_SAMPLE_RATE`

### Collector Connection Issues

```bash
# Test connectivity
curl -v http://$OTEL_EXPORTER_OTLP_ENDPOINT/v1/traces

# Check network
netstat -an | grep 4318

# Check firewall
tcpdump -i any -n port 4318
```

### High Export Latency

1. Check collector CPU/memory usage
2. Check network latency to collector
3. Reduce sampling rate
4. Reduce batch processor delay: `OTEL_BATCH_SPAN_PROCESSOR_SCHEDULE_DELAY=10000` (10s)

### Storage Costs High

1. Reduce sampling rate: `OTEL_SAMPLE_RATE=0.05` (5%)
2. Reduce trace retention in collector
3. Enable span filtering (only important traces)

---

## Deployment Checklist

### Pre-Rollout

- [ ] Code reviewed and tested
- [ ] OpenTelemetry libraries available
- [ ] OTLP collector deployed and verified
- [ ] Documentation complete
- [ ] Team trained on trace analysis
- [ ] Monitoring and alerts configured
- [ ] Rollback procedure documented and tested
- [ ] Cost estimation complete
- [ ] Sampling rates decided for each phase

### Phase 0 (Disabled)

- [ ] Deploy with `ENABLE_OTEL_TRACING=false`
- [ ] Verify no startup errors
- [ ] Confirm zero latency impact
- [ ] Collect baseline metrics

### Phase 1 (Local Dev)

- [ ] Enable on dev environment
- [ ] Run local collector (Jaeger)
- [ ] Verify full traces visible
- [ ] Test exception handling
- [ ] Document typical traces

### Phase 2 (Staging)

- [ ] Deploy to staging with 10% sampling
- [ ] Run load tests
- [ ] Measure trace latency
- [ ] Estimate storage costs
- [ ] Verify sampling distribution
- [ ] Alert threshold testing

### Phase 3 (Production Canary)

- [ ] Deploy to small % of production
- [ ] Monitor for 48 hours
- [ ] Collect real-world latency data
- [ ] Verify no dropped traces
- [ ] Validate alert thresholds
- [ ] Cost tracking

### Phase 4 (Production Ramp)

- [ ] Weekly increase of sampling rate
- [ ] Continuous monitoring
- [ ] Gradual team training
- [ ] Feedback collection
- [ ] Documentation updates

---

## Success Criteria

Distributed tracing is production-ready when:

✅ **Phase 0**: Code stable, zero impact when disabled  
✅ **Phase 1**: Full traces visible in development  
✅ **Phase 2**: Collector stable under load, costs acceptable  
✅ **Phase 3**: Production canary stable, no latency impact  
✅ **Phase 4**: 100% sampling with acceptable cost  

Typical timeline: **5 weeks** from deploy to full production tracing.

---

## Collector Setup (Docker)

### Jaeger (Local Development)

```bash
docker run -d \
  -p 5775:5775/udp \
  -p 6831:6831/udp \
  -p 16686:16686 \
  -p 4318:4318 \
  jaegertracing/all-in-one:latest
```

Then access at `http://localhost:16686`

### OTEL Collector (Production)

```bash
docker run -d \
  -p 4318:4318 \
  -v ./otel-config.yaml:/etc/otel-collector-config.yaml \
  -e GOGC=100 \
  otel/opentelemetry-collector:latest \
  --config=/etc/otel-collector-config.yaml
```

With `otel-config.yaml`:

```yaml
receivers:
  otlp:
    protocols:
      http:
        endpoint: 0.0.0.0:4318

processors:
  batch:
    send_batch_size: 1000
    timeout: 10s

exporters:
  datadog:
    api:
      key: ${DD_API_KEY}

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [datadog]
```
