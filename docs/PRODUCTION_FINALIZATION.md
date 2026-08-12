# Production Finalization: Atomic Reservations

This document describes the final step after the atomic reservation system has proven stable in production.

## Prerequisites for Finalization

Before proceeding with cleanup, verify:

✅ System running at 100% traffic for >= 2 weeks  
✅ Zero oversells during entire period  
✅ Zero orphaned registrations  
✅ Atomic success rate >= legacy success rate  
✅ Redis latency p99 < 50ms consistently  
✅ Zero unhandled compensation failures  
✅ Processed >= 1,000,000 atomic registrations  
✅ Database consistency checks pass (all validation queries return 0 inconsistencies)  
✅ All alerts for 2+ weeks show zero issues  
✅ Incident-free period >= 14 consecutive days  

## Cleanup Steps (One-Time)

### Step 1: Verify Current State

```bash
# Check that atomic system is fully deployed
curl https://your-app.com/api/metrics/registrations | jq '.registrations.atomic'

# Should show high attempt counts and > 99% success rate
# Example output:
{
  "attempts": 2500000,
  "succeeded": 2481500,
  "failed": 18500,
  "successRate": 99.26,
  "accountsCreated": 1243000,
  "accountsReused": 1238500
}
```

### Step 2: Remove Feature Flag Logic

**File**: `src/app/(public)/events/[slug]/actions.ts`

**Before**:
```typescript
const isAtomicEnabled = env.ENABLE_ATOMIC_REGISTRATIONS === "true";
const registrationFn = isAtomicEnabled ? registerAttendeeForEventAtomic : registerAttendeeForEvent;
const result = await registrationFn(eventSlug, parsed.data);
```

**After**:
```typescript
const result = await registerAttendeeForEventAtomic(eventSlug, parsed.data);
```

Also remove the unused import:
```typescript
- import { registerAttendeeForEvent, registerAttendeeForEventAtomic } from "@/lib/registrations";
+ import { registerAttendeeForEventAtomic } from "@/lib/registrations";
```

### Step 3: Rename Atomic to Standard

**File**: `src/lib/registrations.ts`

1. Rename function:
   ```typescript
   - export async function registerAttendeeForEventAtomic(
   + export async function registerAttendeeForEvent(
   ```

2. Update comment:
   ```typescript
   + // Atomic capacity reservation engine: Redis L1 + MongoDB L2 ACID
     export async function registerAttendeeForEvent(
   ```

3. Keep metrics recording as-is (metrics path distinction removed in next step)

### Step 4: Clean Up Legacy Function

**File**: `src/lib/registrations.ts`

Delete the old non-atomic `registerAttendeeForEvent` function entirely:

```typescript
- export async function registerAttendeeForEvent(
-   eventSlug: string,
-   formValues: AttendeeRegistrationInput
- ): Promise<RegistrationBusinessResult> {
-   metricsCollector.recordRegistrationAttempt("legacy");
-   // ... entire function ...
- }
```

### Step 5: Simplify Metrics

**File**: `src/lib/registration-metrics.ts`

Since there's only one path now, simplify metrics to remove "legacy" vs "atomic" distinction:

```typescript
// Before:
recordRegistrationAttempt(path: "atomic" | "legacy"): void;

// After:
recordRegistrationAttempt(): void;  // Only one path
```

Update all callers:
```typescript
- metricsCollector.recordRegistrationAttempt("atomic");
+ metricsCollector.recordRegistrationAttempt();
```

Also simplify metrics snapshot:
```typescript
// Before:
registrations: {
  atomic: { /* ... */ },
  legacy: { /* ... */ }
}

// After:
registrations: {
  /* metrics for single path */ 
}
```

### Step 6: Remove Env Config

**File**: `src/lib/env.ts`

```typescript
// Before:
ENABLE_ATOMIC_REGISTRATIONS: z.enum(["true", "false"]).default("false")

// After:
// Remove entirely - no longer needed
```

Update parsedEnv:
```typescript
- ENABLE_ATOMIC_REGISTRATIONS: process.env.ENABLE_ATOMIC_REGISTRATIONS
```

### Step 7: Update Environment Documentation

**File**: `.env.example`

```bash
# Before:
REDIS_URL=
ENABLE_ATOMIC_REGISTRATIONS=false

# After:
# Redis (required for atomic capacity reservation)
REDIS_URL=redis://localhost:6379
```

Mark Redis as required now that it's the default:

```bash
# MongoDB (required)
MONGODB_URI=...
MONGODB_DB=evenregman

# Redis (required for atomic capacity reservation)
REDIS_URL=redis://...
```

### Step 8: Update README

**File**: `README.md`

Change from optional to standard architecture:

**Before**:
```markdown
- **Concurrency-Safe Capacity Reservation** (Optional): Two-tier atomic system...
```

**After**:
```markdown
- **Concurrency-Safe Capacity Reservation**: Redis + MongoDB two-tier atomic system prevents overselling even under extreme concurrency (tested up to 1000 concurrent registrations).
```

Add to features:
```markdown
### Registration Features
- **Atomic Capacity Reservation**: Prevents race conditions using Redis Lua scripts + MongoDB transactions
- **High Concurrency Support**: Handles 1000+ concurrent registrations without overselling
- **Graceful Degradation**: If Redis unavailable, falls back to DB-only ACID transactions
```

### Step 9: Archive & Organize Documentation

**Files to keep**:
- `docs/ATOMIC_RESERVATIONS.md` - Rename to standard architecture doc
- `docs/DEPLOYMENT_STRATEGY.md` - Archive (move to `docs/archive/`)
- `docs/ATOMIC_REGISTRATIONS_TESTING.md` - Simplify, update as general testing guide

**Files to delete**:
- `.env.local` (if test-specific)

**Reorganize**:
```
docs/
├── ATOMIC_RESERVATIONS.md (rename from architecture-specific to general)
├── DEPLOYMENT_STRATEGY.md (move to archive as historical reference)
├── ATOMIC_REGISTRATIONS_TESTING.md (simplify for ongoing testing)
└── archive/
    └── DEPLOYMENT_STRATEGY.md (historical record)
```

### Step 10: Remove Atomic-Specific Test Suite

**File**: `src/lib/__tests__/registrations-atomic.test.ts`

Since there's only one registration function now, merge atomic tests into main test suite:

**Option A**: Keep as-is (no harm, documents the atomic behavior)

**Option B**: Delete and merge into general registration tests:
```bash
rm src/lib/__tests__/registrations-atomic.test.ts
```

Update test imports/exports accordingly.

### Step 11: Update Git History (Optional)

For clean git history, consider squashing or annotating:

```bash
# Tag the atomic system completion
git tag -a atomic-registrations-v1.0 -m "Atomic capacity reservation system stable in production"

# Or document in commit message for next PR:
# "Finalize atomic registration system (removes feature flag)"
```

### Step 12: Verify Build & Tests

```bash
# Ensure TypeScript compiles
npm run typecheck

# Run all tests
npm test

# Type-check
npm run build

# Smoke test locally
npm run dev
# Visit: http://localhost:3000/events/[test-slug]
# Attempt registration
```

### Step 13: Create Final Deployment Commit

```bash
git commit -m "finalize: Atomic capacity reservation system production-ready

- Remove feature flag and legacy registration path
- Rename registerAttendeeForEventAtomic to registerAttendeeForEvent
- Simplify metrics to single registration path
- Update documentation to reflect atomic as standard
- Mark Redis as required (was optional)
- Archive deployment strategy documentation
- All tests passing, zero production issues over 2+ weeks
- Processed 1M+ atomic registrations with 99%+ success rate
- Database consistency validated

This completes the atomic capacity reservation system rollout.
System now prevents overselling at any concurrency level."