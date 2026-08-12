# Enterprise Multi-Tenant RBAC/ABAC & Audit Engine

## Overview

The **Enterprise Multi-Tenant RBAC/ABAC & Audit Engine** transforms authorization from binary role checks (`role === 'HOST'`) into a sophisticated access control system with:
- **Multi-tenant domain hierarchy** (Organization → Membership → User)
- **Role-Based Access Control (RBAC)** with 4 tiers (OWNER/ADMIN/EVENT_MANAGER/VIEWER)
- **Attribute-Based Access Control (ABAC)** for context-aware rules (e.g., can't edit archived events)
- **Immutable audit trail** for compliance and debugging

### Problem Solved

**Before**: Authorization is binary and scattered across the codebase
```typescript
if (event.hostId !== userId) throw new Error("Forbidden")
```

**After**: Centralized, context-aware permission evaluation
```typescript
const result = await canUserPerformAction(userId, 'edit_event', event)
```

## Architecture

### Domain Hierarchy

```
Organization (multi-tenant container)
  ├─ name, slug, tier, customDomain, ownerId
  └─ Membership[] (user-org relationships)
      ├─ userId, role (OWNER|ADMIN|EVENT_MANAGER|VIEWER)
      └─ AuditLog[] (immutable actions log)
```

### Permission Matrix

| Role | create_event | edit_event | delete_event | invite_member | view_audit_log |
|------|--------------|-----------|--------------|---------------|----------------|
| OWNER | ✅ | ✅ | ✅ | ✅ | ✅ |
| ADMIN | ✅ | ✅ | ✅ | ✅ | ✅ |
| EVENT_MANAGER | ✅ | ✅ (own) | ❌ | ❌ | ❌ |
| VIEWER | ❌ | ❌ | ❌ | ❌ | ❌ |

### ABAC Context Rules

Permissions can be denied by context rules even if RBAC allows:

```typescript
EVENT_MANAGER + edit_event:
  ✅ If: event.orgId === user.activeOrgId AND event.status !== 'ARCHIVED'
  ❌ If: event.status === 'ARCHIVED'
  ❌ If: event.orgId !== user.activeOrgId
```

## Components

### 1. Models

**Organization** (`src/models/Organization.ts`)
- Represents a multi-tenant container
- Fields: name, slug (unique), tier, customDomain, ownerId
- Indexes: slug (unique), ownerId, createdAt

**Membership** (`src/models/Membership.ts`)
- Maps users to organizations with roles
- Unique pair index: (userId, orgId)
- Auto-statics: `findUserMembership()`, `findUserOrgs()`

**AuditLog** (`src/models/AuditLog.ts`)
- Immutable record of all actions
- TTL index: auto-deletes after 7 years
- Unique constraints: none (append-only)

### 2. Permission Engine

**`src/lib/permissions.ts`**

```typescript
// Check if action is allowed
const result = await canUserPerformAction(userId, action, resource, context)
// { allowed: true/false, reason?: string }

// Check org membership
const membership = await getUserMembership(userId, orgId)

// Get user's organizations
const orgs = await getUserOrganizations(userId)
```

### 3. Audit Logging

**`src/lib/audit-logger.ts`**

```typescript
// Log an action (sync)
await logAuditEvent({
  actorId: userId,
  action: 'UPDATE',
  targetType: 'Event',
  targetId: eventId,
  targetOrgId: orgId,
  before: { status: 'DRAFT' },
  after: { status: 'PUBLISHED' }
})

// Log an action (async, non-blocking)
await logAuditEventAsync(data)

// Query audit trail
const logs = await getOrgAuditLogs(orgId, { action: 'UPDATE', limit: 50 })
```

### 4. Permission Guards

**`src/lib/permission-guards.ts`**

```typescript
// Throw if denied
await assertUserCanPerformAction(userId, 'edit_event', event)

// Throw if not org member
await assertUserCanAccessOrg(userId, orgId)

// Validate org boundary
validateCrossTenantAccess(userId, userOrgId, targetOrgId)

// Wrapper for gradual adoption
const guardedAction = withPermissionCheck(
  updateEvent,
  'edit_event',
  { resourceExtractor: (eventId) => ({ id: eventId }) }
)
```

### 5. Bootstrap & Migration

**`src/lib/org-bootstrap.ts`**

```typescript
// Create user's default org (called on signup)
const org = await createPersonalOrganization(userId)

// Ensure user has org (idempotent)
const membership = await ensureUserHasDefaultOrg(userId)

// Backfill existing users (optional, one-time)
await backfillUserOrganizations(dryRun = true)

// Link events to org (one-time migration)
await backfillEventOrganizations(dryRun = true)
```

### 6. Gradual Migration

**`src/lib/permission-adapter.ts`**

Transparent fallback to legacy checks when RBAC disabled:

```typescript
if (env.ENABLE_RBAC_ENGINE === 'true') {
  // New RBAC path
  await assertEventOwnershipRBAC(eventId, userId)
} else {
  // Legacy path (unchanged)
  await legacyAssertEventOwnership(eventId, userId)
}
```

**`src/lib/permission-integration.ts`**

Unified API for new code:

```typescript
// Uses RBAC or legacy depending on feature flag
await assertUserCanEditEvent(eventId, userId)
```

## Configuration

### Environment Variables

```env
# Enable RBAC/ABAC system
ENABLE_RBAC_ENGINE=false              # Default: disabled (no impact)

# Auto-create orgs on first login
RBAC_AUTO_BOOTSTRAP_ORGS=true         # Default: enabled

# Audit log retention
RBAC_AUDIT_RETENTION_DAYS=2555        # Default: 7 years

# Log sensitive data access
RBAC_LOG_SENSITIVE_ACTIONS=false      # Default: disabled
```

## API Endpoints

### Audit Log Query

```
GET /api/audit/{orgId}/logs
  ?action=UPDATE
  &targetType=Event
  &limit=50
  &skip=0

Response:
{
  "logs": [ { audit entry }, ... ],
  "total": 1250,
  "limit": 50,
  "skip": 0,
  "hasMore": true
}
```

Requires: Organization membership with `view_audit_log` permission.

## Deployment Phases

### Phase 0: Infrastructure (Week 1)
```env
ENABLE_RBAC_ENGINE=false
```
- Models created but not used
- No behavior change
- Infrastructure verified (MongoDB indexes, migrations)

### Phase 1: Read-Only Audit (Week 2)
```env
ENABLE_RBAC_ENGINE=true
RBAC_AUTO_BOOTSTRAP_ORGS=true
```
- Permissions evaluated but not enforced (logged only)
- All mutations written to audit trail
- Existing ownership checks still used

### Phase 2: Selective Enforcement (Week 3)
- New endpoints enforce RBAC
- Existing endpoints use legacy checks (with fallback)
- Audit trail complete

### Phase 3: Full Enforcement (Week 4+)
- All endpoints use RBAC
- Legacy checks removed
- Stable production system

## Data Migration

### Step 1: Create Organizations (Dry-Run)
```bash
const result = await backfillUserOrganizations(true)
// { processed: N, created: M, errors: 0 }
```

### Step 2: Link Events to Organizations (Dry-Run)
```bash
const result = await backfillEventOrganizations(true)
// { processed: N, updated: M, errors: 0 }
```

### Step 3: Verify, Then Commit
```bash
await backfillUserOrganizations(false)  // Commit changes
await backfillEventOrganizations(false)
```

### Step 4: Enable RBAC
```env
ENABLE_RBAC_ENGINE=true
```

## Security Considerations

✅ **Cross-Tenant Isolation**: All queries filtered by `orgId`; direct tenant bypass impossible  
✅ **Audit Trail**: Immutable log of all actions (7-year retention)  
✅ **Sensitive Field Redaction**: Passwords, tokens, API keys never logged  
✅ **Ownership Validation**: All resource mutations require permission check  
✅ **Access Control API**: Audit logs require membership validation  

## Performance Characteristics

| Operation | Target | Notes |
|-----------|--------|-------|
| Permission check | < 10ms | Cached membership lookup |
| Audit log write | async | Non-blocking, fire-and-forget |
| Audit log query | < 100ms | Indexed by org + timestamp |
| Bootstrap create | < 50ms | Single insert operation |

## Backward Compatibility

✅ **Zero Breaking Changes**:
- Feature flag defaults to false (RBAC disabled)
- Existing code continues to work unchanged
- Can enable/disable at runtime (no restart)
- Gradual migration path available

✅ **Fallback Paths**:
- When RBAC disabled: legacy role checks still work
- When membership missing: falls back to hostId comparison
- When audit fails: doesn't block mutations

## Troubleshooting

### "User not member of organization"
**Cause**: User has no Membership record for org  
**Fix**: Run bootstrap: `await ensureUserHasDefaultOrg(userId)`

### Audit logs not appearing
**Cause**: ENABLE_RBAC_ENGINE=false or async logging slow  
**Fix**: Check env var, wait 10 seconds, query again

### Backfill hangs
**Cause**: Large dataset or slow DB  
**Fix**: Run in background, monitor via dry-run first

### Cross-tenant data visible
**Cause**: Code using raw query without orgId filter  
**Fix**: Use permission guards or add orgId filter

## References

- [[CSV_EXPORT_DEPLOYMENT.md]] — Related feature
- [[RATE_LIMITING.md]] — Rate limiting patterns
- [[ATOMIC_REGISTRATIONS.md]] — Atomic operations patterns
