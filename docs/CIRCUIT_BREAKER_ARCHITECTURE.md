# Resilient External Service Circuit Breaker & Fallback System

## Overview

**Circuit Breaker Pattern** protects the application from cascading failures caused by degraded or unavailable external services. When external service failures reach a threshold, the breaker trips to OPEN state, immediately rejecting requests without wasting network calls.

### Problem Solved

**Before**: External service failures back up requests, exhaust connection pools, trigger cascading failures  
**After**: Circuit breaker fails fast; fallback queue persists requests for later retry; application stays responsive

## Architecture

### State Machine

```
CLOSED (Normal)
  ↓ (failures exceed threshold)
OPEN (Fail Fast)
  ↓ (after resetTimeout)
HALF_OPEN (Probe)
  ├─ Success → CLOSED (Resume)
  └─ Failure → OPEN (Retry)
```

### Request Flow

```
User Request
  ↓
Circuit Breaker Check
  ├─ CLOSED: Execute normally
  ├─ OPEN: Fail-fast or invoke fallback (< 1ms, no network)
  └─ HALF_OPEN: Allow single probe request
  ↓
Execute External API Call (with timeout)
  ├─ Success: Record success, evaluate threshold
  └─ Failure: Record failure, evaluate threshold
  ↓
Evaluate Error Rate
  ├─ Below threshold: Stay CLOSED
  └─ Above threshold: Trip to OPEN
```

### Fallback Strategy

```
Request Fails
  ↓
Circuit Breaker Open?
  ├─ Yes: Execute fallback strategy
  │   ├─ Queue Fallback: Persist to MongoDB queue, retry later
  │   ├─ Cache Fallback: Return stale cached data
  │   ├─ Default Fallback: Return safe default value
  │   └─ Reject Fallback: Fail fast
  └─ No: Fail-fast to caller
```

## Components

### Configuration (`src/lib/circuit-breaker-config.ts`)

- `CircuitBreakerConfig`: Settings interface
- Presets: conservative (strict), normal (balanced), aggressive (lenient)
- Validation: threshold 0-100%, volume > 0, timeout > 0
- Environment variables for runtime configuration

### State Machine (`src/lib/circuit-breaker.ts`)

- `InMemoryCircuitBreaker<T>`: Core state machine
- `execute()`: Request execution with state management
- Rolling window: Resets metrics every N milliseconds
- Error rate calculation: (failures / total) * 100

### Fallback Strategies (`src/lib/fallback-strategies.ts`)

- `FallbackStrategy<T>`: Pluggable interface
- `QueueFallback`: Persist to MongoDB for retry
- `CachedResponseFallback`: Return stale data
- `DefaultValueFallback`: Return safe default
- `RejectionFallback`: Fail immediately
- `ComposedFallback`: Chain strategies in sequence

### Fallback Queue (`src/lib/fallback-queue.ts`)

- MongoDB collection: `fallback_queue`
- Status tracking: pending, processing, completed, failed
- Exponential backoff: 60s → 120s → 240s... → 3600s
- TTL cleanup: auto-delete after 7 days (configurable)
- Retry limit: 5 attempts (configurable per request)

### Notification Service (`src/lib/notifications-with-circuit-breaker.ts`)

- Email: normal preset (50% threshold)
- SMS: normal preset (50% threshold)
- Webhook: aggressive preset (70% threshold)
- Per-provider circuit breaker isolation
- Fallback to queue on service failure

### External API Wrapper (`src/lib/external-api-with-circuit-breaker.ts`)

- `callExternalAPI()`: Generic wrapper for any async call
- `fetchExternalAPI()`: Drop-in fetch replacement
- Per-endpoint circuit breakers
- Fallback strategy support
- Request timeout enforcement

### Outbox Relay Integration (`src/lib/outbox-circuit-breaker.ts`)

- Per-event-type circuit breakers
- Integration with outbox event processing
- Fallback queue for failed events
- Event isolation (email failures don't affect payments)

### Metrics (`src/lib/circuit-breaker-metrics.ts`)

- `getCircuitBreakerMetrics()`: All breakers snapshot
- `getCircuitBreakerHealthReport()`: Comprehensive health check
- `isCircuitBreakerTripped()`: Single breaker status
- `checkHealthAlerts()`: Detect problems
- `cleanupFallbackQueue()`: Maintenance

## Configuration

### Environment Variables

```env
# Feature Flag
ENABLE_CIRCUIT_BREAKER=false

# Core Thresholds
CIRCUIT_BREAKER_TIMEOUT_MS=3000              # Request timeout
CIRCUIT_BREAKER_ERROR_THRESHOLD_PERCENTAGE=50 # Trip at 50% errors
CIRCUIT_BREAKER_VOLUME_THRESHOLD=20           # Min requests to evaluate
CIRCUIT_BREAKER_RESET_TIMEOUT_MS=30000        # Probe interval (30s)
CIRCUIT_BREAKER_ROLLING_WINDOW_MS=10000       # Evaluation window (10s)

# Fallback Behavior
CIRCUIT_BREAKER_ENABLE_FALLBACK=true          # Queue failed requests
CIRCUIT_BREAKER_FALLBACK_QUEUE_RETENTION_DAYS=7
```

### Presets

| Preset | Error Threshold | Volume | Reset Timeout | Window |
|--------|-----------------|--------|---------------|--------|
| Conservative | 30% | 50 | 60s | 20s |
| Normal | 50% | 20 | 30s | 10s |
| Aggressive | 70% | 10 | 15s | 5s |

## Performance Characteristics

| Scenario | Latency | Impact |
|----------|---------|--------|
| CLOSED (success) | < 5ms | Normal request path |
| CLOSED (failure) | var | Timeout + failure handling |
| OPEN (breaker active) | < 1ms | Instant rejection, no I/O |
| HALF_OPEN (probe) | var | One request allowed through |
| Fallback queue write | < 10ms | MongoDB insert |

## Backward Compatibility

✅ **Zero Breaking Changes**:
- Feature flag defaults to false
- When disabled, all wrappers are pass-through
- Existing external service calls unchanged if not wrapped
- Optional integration points

✅ **Coexistence**:
- Can enable per-service gradually
- Mix wrapped and unwrapped calls
- Runtime configuration changes

## Use Cases

### 1. Email Delivery Degradation
```
Email service latency spikes → Error rate exceeds 50%
→ Circuit breaker OPEN
→ Fallback: queue emails to MongoDB
→ User sees success immediately
→ Emails retry automatically when service recovers
```

### 2. Payment Gateway Failure
```
Payment API down → All requests timeout
→ Error rate exceeds 50%
→ Circuit breaker OPEN
→ Fallback: reject payment (user retries)
→ Prevents charging users multiple times
```

### 3. External API Rate Limiting
```
Geocoding API rate limit hit → 429 responses
→ Error rate exceeds threshold
→ Circuit breaker OPEN
→ Fallback: return cached location data
→ User sees slightly stale data but no error
```

## Monitoring & Alerting

### Key Metrics

- Circuit breaker state (CLOSED/OPEN/HALF_OPEN)
- Request/success/failure counts
- Success rate (%)
- Last failure/success time
- Time breaker has been OPEN

### Alert Conditions

```
ALERT: Circuit breaker OPEN (indicates upstream failure)
ALERT: Fallback queue > 100 items (indicates persistent failure)
ALERT: Success rate < 50% (threshold breached)
WARNING: Breaker OPEN for > 5 minutes (recovery stalled)
```

## Best Practices

1. **Configuration**: Use NORMAL preset for most services, CONSERVATIVE for critical paths
2. **Timeout**: Set timeout < reset timeout (avoid double-waiting)
3. **Volume Threshold**: Higher for low-traffic services, lower for high-traffic
4. **Fallback Strategy**: Choose based on business requirements
5. **Monitoring**: Watch fallback queue depth and state transitions
6. **Testing**: Simulate external service failures, verify graceful degradation

## References

- [[CIRCUIT_BREAKER_DEPLOYMENT.md]] — Rollout strategy
- [[CIRCUIT_BREAKER_MIGRATION_GUIDE.md]] — Usage examples
- [Release It! Design and Deploy Production-Ready Software](https://pragprog.com/titles/mnee2/release-it-second-edition/)
