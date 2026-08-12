# Circuit Breaker Migration Guide

## Quick Start: Wrapping External Service Calls

### Email Notifications

**Before**:
```typescript
await emailService.send({
  to: user.email,
  subject: 'Welcome',
  body: 'Thanks for signing up!',
});
```

**After**:
```typescript
import { createNotificationService } from '@/lib/notifications-with-circuit-breaker';

const notificationService = createNotificationService(
  emailProvider.send,
  smsProvider.send,
  webhookProvider.send,
);

await notificationService.sendEmail({
  to: user.email,
  subject: 'Welcome',
  body: 'Thanks for signing up!',
});
```

**What it does**:
- Wraps email send with circuit breaker
- On failure: automatically queues to MongoDB
- User sees success immediately
- Email retried when service recovers

---

## Wrapping Generic External API Calls

### Payment Processor

**Before**:
```typescript
const chargeId = await stripeAPI.charges.create({
  amount: 9999,
  currency: 'usd',
  card: cardToken,
});
```

**After**:
```typescript
import { callExternalAPI } from '@/lib/external-api-with-circuit-breaker';
import { DefaultValueFallback } from '@/lib/fallback-strategies';

const chargeId = await callExternalAPI(
  () =>
    stripeAPI.charges.create({
      amount: 9999,
      currency: 'usd',
      card: cardToken,
    }),
  {
    serviceName: 'stripe',
    operationName: 'charges.create',
    preset: 'conservative', // Strict for payments
    fallbackStrategy: new DefaultValueFallback(null),
  },
);

if (!chargeId) {
  // Fallback triggered, retry payment later
  return Response.json({ error: 'Payment temporarily unavailable' }, { status: 503 });
}
```

**What it does**:
- Wraps Stripe API with circuit breaker
- On failure: returns null (fallback)
- User sees "try again later" message
- Application stays responsive

---

## Wrapping Fetch Calls

### Geocoding API

**Before**:
```typescript
const response = await fetch('https://api.geocode.io/search', {
  method: 'GET',
  headers: { Authorization: `Bearer ${GEOCODE_KEY}` },
});

const data = await response.json();
```

**After**:
```typescript
import { fetchExternalAPI } from '@/lib/external-api-with-circuit-breaker';
import { CachedResponseFallback } from '@/lib/fallback-strategies';

const cachedFallback = new CachedResponseFallback(3600000); // 1 hour TTL

const data = await fetchExternalAPI<GeoResult>(
  'https://api.geocode.io/search',
  {
    method: 'GET',
    headers: { Authorization: `Bearer ${GEOCODE_KEY}` },
    timeout: 5000,
  },
  {
    serviceName: 'geocode-io',
    operationName: 'search',
    preset: 'normal',
    fallbackStrategy: cachedFallback,
  },
);

if (!data) {
  // Fallback triggered, using cached data or null
  return { location: null };
}
```

**What it does**:
- Wraps fetch with circuit breaker and timeout
- On failure: returns cached location (stale data)
- User sees last known location
- No error message needed

---

## Fallback Strategy Selection

### Decision Tree

```
Is failure acceptable?
├─ YES: Use DefaultValueFallback (return null/empty)
│   Example: Geocoding failure, use last known location
│
├─ NO (critical operation):
│   Should we retry?
│   ├─ YES: Use QueueFallback (persist and retry)
│   │   Example: Payment, email, message delivery
│   │
│   └─ NO: Use RejectionFallback (fail immediately)
│       Example: Auth check, security operation
│
└─ MAYBE: Use CachedResponseFallback (stale data)
    Example: Search results, product data
```

---

## Advanced: Composing Fallback Strategies

### Try Multiple Fallbacks in Sequence

**Scenario**: If payment fails, try cache, then queue, then fail

```typescript
import { createFallbackChain } from '@/lib/fallback-strategies';

const fallbackChain = createFallbackChain(
  new CachedResponseFallback(3600000), // Try cache first
  new QueueFallback(async (ctx) => {
    await fallbackQueueService.enqueueFallback(ctx);
  }),
  new DefaultValueFallback(null), // Last resort
);

const result = await callExternalAPI(
  () => stripeAPI.charges.create({ ... }),
  {
    serviceName: 'stripe',
    operationName: 'charges.create',
    fallbackStrategy: fallbackChain,
  },
);
```

---

## Outbox Event Integration

### Per-Event-Type Circuit Breaker

**Before**:
```typescript
export async function handleOrderCreated(event: OutboxEvent) {
  await emailService.sendOrderConfirmation(event.payload);
  await webhookService.notifyPartner(event.payload);
}
```

**After**:
```typescript
import { outboxCircuitBreakerRegistry } from '@/lib/outbox-circuit-breaker';

outboxCircuitBreakerRegistry.registerHandler({
  eventType: 'order.created',
  handler: async (event) => {
    await emailService.sendOrderConfirmation(event.payload);
    await webhookService.notifyPartner(event.payload);
  },
  preset: 'normal',
});

// In outbox relay:
await outboxCircuitBreakerRegistry.handleEventWithCircuitBreaker(event);
```

**What it does**:
- Separate circuit breaker per event type
- Email circuit failure doesn't affect payments
- Failed events queue to fallback queue
- Retried independently

---

## Monitoring Circuit Breaker Health

### Get Current Status

```typescript
import { getCircuitBreakerHealthReport } from '@/lib/circuit-breaker-metrics';

const report = await getCircuitBreakerHealthReport();

console.log(`Enabled: ${report.enabled}`);
console.log(`Open breakers: ${report.totalOpenBreakers}`);
console.log(`Avg success rate: ${report.averageSuccessRate.toFixed(2)}%`);
console.log(`Fallback queue pending: ${report.fallbackQueueStats.pending}`);

for (const cb of report.circuitBreakers) {
  console.log(`${cb.name}: ${cb.state} (${cb.successRate.toFixed(2)}% success)`);
}
```

### Check for Alerts

```typescript
import { checkHealthAlerts } from '@/lib/circuit-breaker-metrics';

const alerts = await checkHealthAlerts();

for (const alert of alerts) {
  console.error(alert);
}
```

### View Fallback Queue

```typescript
import { fallbackQueueService } from '@/lib/fallback-queue';

const stats = await fallbackQueueService.getQueueStats();
console.log(`Pending: ${stats.pending}`);
console.log(`Processing: ${stats.processing}`);
console.log(`Completed: ${stats.completed}`);
console.log(`Failed: ${stats.failed}`);
```

---

## Testing Circuit Breaker Behavior

### Simulate Service Failure

```typescript
// Test email circuit breaker
const mockEmailProvider = async () => {
  throw new Error('Service unavailable');
};

const notificationService = createNotificationService(
  mockEmailProvider,
  smsProvider.send,
  webhookProvider.send,
);

// First 20 requests: some succeed, some fail
for (let i = 0; i < 20; i++) {
  try {
    await notificationService.sendEmail({ to: 'test@example.com', ... });
  } catch (err) {
    // Error expected
  }
}

// After 50% failure rate, circuit breaker opens
// Next request: instant rejection, queued to fallback queue
try {
  await notificationService.sendEmail({ ... });
} catch (err) {
  console.log(`Circuit breaker open: ${err.message}`);
}

// Check queue
const stats = await fallbackQueueService.getQueueStats();
console.log(`Queued emails: ${stats.pending}`);
```

### Verify Graceful Degradation

```typescript
// Simulate Stripe timeout
const mockStripeAPI = {
  charges: {
    create: async () => {
      await new Promise(resolve => setTimeout(resolve, 10000));
    },
  },
};

// First timeout: recorded as failure
// Second timeout: recorded as failure
// ... After 50% threshold ...
// Third request: circuit opens, returns fallback immediately

const result = await callExternalAPI(
  () => mockStripeAPI.charges.create(),
  {
    serviceName: 'stripe',
    operationName: 'charges.create',
    preset: 'normal',
    fallbackStrategy: new DefaultValueFallback(null),
  },
);

// Should get fallback value instantly
console.log(`Result (fallback):`, result); // null
```

---

## Configuration by Service

### Email (Normal Preset, Queue Fallback)

```env
CIRCUIT_BREAKER_ERROR_THRESHOLD_PERCENTAGE=50
CIRCUIT_BREAKER_VOLUME_THRESHOLD=20
CIRCUIT_BREAKER_RESET_TIMEOUT_MS=30000
```

```typescript
const notificationService = createNotificationService(
  emailProvider.send,
  smsProvider.send,
  webhookProvider.send,
);
// Queues on failure, retries every 60s exponential
```

### Payment (Conservative Preset, Reject Fallback)

```env
# Conservative: 30% threshold, 50 min requests, 60s reset
```

```typescript
await callExternalAPI(
  () => stripeAPI.charges.create(),
  {
    serviceName: 'stripe',
    operationName: 'charges.create',
    preset: 'conservative', // Strict
    fallbackStrategy: new RejectionFallback(),
  },
);
// Fails immediately on stripe degradation
```

### Geocoding (Normal Preset, Cache Fallback)

```typescript
const cachedFallback = new CachedResponseFallback(3600000);

await fetchExternalAPI(
  'https://api.geocode.io/search',
  { timeout: 5000 },
  {
    serviceName: 'geocode-io',
    operationName: 'search',
    preset: 'normal',
    fallbackStrategy: cachedFallback,
  },
);
// Returns cached location on failure
```

---

## Troubleshooting

### Circuit Breaker Never Opens

1. Check `ENABLE_CIRCUIT_BREAKER=true`
2. Verify error threshold: `CIRCUIT_BREAKER_ERROR_THRESHOLD_PERCENTAGE`
3. Check volume threshold: do you have enough requests?
4. Enable debug logging to see error rate calculations

### Fallback Queue Not Processing

1. Verify `CIRCUIT_BREAKER_ENABLE_FALLBACK=true`
2. Check MongoDB connection
3. Verify `fallback_queue` collection exists
4. Call `retryFallbackNotifications()` manually if needed

### High Latency from Circuit Breaker

1. Check timeout: `CIRCUIT_BREAKER_TIMEOUT_MS`
2. Verify fallback strategy isn't adding latency
3. Check if breaker is in HALF_OPEN state (probing)
4. Profile with OpenTelemetry tracing

---

## Migration Checklist

**Phase 1: Non-Critical Services**
- [ ] Wrap geocoding API
- [ ] Wrap analytics calls
- [ ] Verify cache fallback works
- [ ] Monitor queue depth

**Phase 2: Notifications**
- [ ] Wrap email service
- [ ] Wrap SMS service
- [ ] Test queue fallback
- [ ] Verify retry logic

**Phase 3: Webhooks**
- [ ] Wrap outgoing webhooks
- [ ] Test partner webhook failures
- [ ] Verify queue retry
- [ ] Monitor delivery metrics

**Phase 4: Critical Services**
- [ ] Wrap payment processor
- [ ] Wrap auth service (if external)
- [ ] Test failure scenarios
- [ ] Alert on circuit trip

---

## References

- [[CIRCUIT_BREAKER_ARCHITECTURE.md]] — System design
- [[CIRCUIT_BREAKER_DEPLOYMENT.md]] — Rollout strategy
- [Release It! Design and Deploy Production-Ready Software](https://pragprog.com/titles/mnee2/release-it-second-edition/)
