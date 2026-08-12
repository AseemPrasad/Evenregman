# RBAC/ABAC Deployment & Rollout Strategy

## Phased Rollout Plan

### Phase 0: Infrastructure & Testing (Week 1)

**Configuration**:
```env
ENABLE_RBAC_ENGINE=false
RBAC_AUTO_BOOTSTRAP_ORGS=false
```

**What happens**:
- RBAC code deployed but completely inactive
- Zero impact on existing flows
- Infrastructure can be verified (MongoDB collections created)
- Data migrations can be tested in dry-run mode

**Verification Checklist**:
- ✅ Organization, Membership, AuditLog collections exist
- ✅ Indexes are created (slug unique, userId+orgId unique, TTL)
- ✅ Existing ownership checks still work unchanged
- ✅ No errors in logs
- ✅ Database space available for audit logs

**Success Criteria**:
- No new errors or warnings
- All collections accessible
- Indexes verify with `db.collection.getIndexes()`

---

### Phase 1: Read-Only Audit (Week 2)

**Configuration**:
```env
ENABLE_RBAC_ENGINE=true
RBAC_AUTO_BOOTSTRAP_ORGS=true
```

**What happens**:
- RBAC system active but not enforcing (permissions logged, not checked)
- Auto-creates organizations for new users
- All mutations logged to AuditLog
- Existing ownership checks still used

**Deployment Steps**:

1. **Update environment variables**:
   ```env
   ENABLE_RBAC_ENGINE=true
   RBAC_AUTO_BOOTSTRAP_ORGS=true
   RBAC_AUDIT_RETENTION_DAYS=2555
   ```

2. **Restart application server**

3. **Run backfill in dry-run mode**:
   ```bash
   # Test what will be created
   await backfillUserOrganizations(true)
   await backfillEventOrganizations(true)
   ```

4. **Verify audit logging**:
   ```bash
   curl /api/audit/{orgId}/logs
   # Should return empty logs (no enforcement yet)
   ```

5. **Create test user** → verify auto-bootstrap creates org

**Monitoring** (every 2 hours):
```bash
# Check org creation
db.organizations.count()

# Check membership creation
db.memberships.count()

# Check audit logs
db.auditlogs.count()

# Check for errors
tail -f app.log | grep "RBAC\|Permission\|Audit"
```

**Testing Scenarios**:
- [ ] New user signup → auto-creates organization
- [ ] New user can still edit own events (legacy check works)
- [ ] Audit logs created for event mutations
- [ ] Audit logs don't block mutations
- [ ] Ownership checks still work (EVENT_MANAGER doesn't have access yet)

**Success Criteria**:
- ✅ 100% of new users get org created
- ✅ Zero errors in RBAC initialization
- ✅ Audit logs capture all mutations
- ✅ No performance regression (< 50ms added per request)
- ✅ Existing flows work unchanged

**If Issues Found**:
- Set `ENABLE_RBAC_ENGINE=false`
- Investigate root cause
- Fix and test in staging
- Retry Phase 1

---

### Phase 2: Selective Enforcement (Week 3)

**Configuration** (same as Phase 1):
```env
ENABLE_RBAC_ENGINE=true
RBAC_AUTO_BOOTSTRAP_ORGS=true
```

**What happens**:
- New endpoints enforce RBAC permissions
- Existing endpoints still use legacy ownership checks
- Dual-path support: both RBAC and legacy work
- Cross-tenant access blocked with 403 Forbidden

**Deployment**:
- No code changes (same as Phase 1)
- Same environment variables
- Gradual adoption via `assertUserCanEditEvent()` (uses RBAC + fallback)

**Duration**: 1 week

**Conversion to Selective Enforcement**:

Update specific endpoints to use RBAC:

```typescript
// Old (legacy):
import { assertEventOwnership } from "@/lib/ownership"
await assertEventOwnership(eventId, userId)

// New (selective, RBAC + fallback):
import { assertUserCanEditEvent } from "@/lib/permission-integration"
await assertUserCanEditEvent(eventId, userId)
```

**Monitoring** (every 4 hours):
```bash
# Check permission denials
db.auditlogs.find({ action: "PERMISSION_DENIED" }).count()

# Check for errors
grep -c "ERROR" app.log

# Monitor API latency
curl /metrics | grep request_duration_p99

# Check org distribution
db.memberships.aggregate([
  { $group: { _id: "$role", count: { $sum: 1 } } }
])
```

**Rollback Trigger** (if any):
- ❌ Permission denials > 1% of requests
- ❌ User complaints about access denied
- ❌ Performance regression (latency > 100ms)
- ❌ Cross-tenant data leaks
- ❌ Audit log errors blocking mutations

**Rollback Procedure** (instant):
```env
ENABLE_RBAC_ENGINE=false
# Restart app server
# All new requests bypass RBAC
# Legacy checks continue
```

**Success Criteria**:
- ✅ Zero unauthorized data access
- ✅ Permission denials < 1% (legitimate use)
- ✅ No performance impact
- ✅ Audit trail complete and correct
- ✅ Existing endpoints still work

---

### Phase 3: Full Enforcement (Week 4+)

**Configuration** (same as Phase 2):
```env
ENABLE_RBAC_ENGINE=true
RBAC_AUTO_BOOTSTRAP_ORGS=true
```

**What happens**:
- All endpoints use RBAC
- Legacy ownership checks removed (or relegated to fallback)
- Stable production configuration
- Ongoing monitoring and tuning

**Deployment**:
- No code changes (migrate all endpoints to use new guards)
- Same environment variables
- Remove legacy-only code paths

**Maintenance Tasks** (weekly):

1. **Monitor metrics**:
   ```bash
   curl /api/metrics/rbac | jq '.permissions_checked'
   curl /api/metrics/rbac | jq '.denials_by_reason'
   ```

2. **Review audit logs**:
   ```bash
   db.auditlogs.find({
     action: "PERMISSION_DENIED",
     createdAt: { $gte: ISODate("2025-08-05") }
   }).count()
   ```

3. **Check membership activity**:
   ```bash
   db.memberships.find({
     updatedAt: { $gte: ISODate("2025-08-05") }
   }).count()
   ```

4. **Verify audit retention**:
   ```bash
   # TTL should auto-delete entries older than 7 years
   db.auditlogs.find({
     createdAt: { $lt: ISODate("2018-08-12") }
   }).count()  # Should be 0
   ```

**Long-term Monitoring**:
- [ ] Weekly permission denial trends
- [ ] Monthly audit log size
- [ ] Quarterly permission matrix review
- [ ] Annual security audit of audit trail

---

## Data Migration Checklist

### Pre-Migration

- [ ] Backup MongoDB
- [ ] Backup Event collection specifically
- [ ] Document current event count
- [ ] Document current user count (role='HOST')
- [ ] Test backfill scripts in staging
- [ ] Schedule maintenance window if needed

### Migration Phase 0 (Dry-Run)

- [ ] Run `backfillUserOrganizations(true)`
- [ ] Verify number of orgs that would be created
- [ ] Run `backfillEventOrganizations(true)`
- [ ] Verify number of events that would be linked
- [ ] Estimated storage impact of audit logs

### Migration Phase 1 (Live)

- [ ] Run `backfillUserOrganizations(false)` (commit)
- [ ] Verify all users have at least one membership
- [ ] Run `backfillEventOrganizations(false)` (commit)
- [ ] Verify all events have orgId set
- [ ] Spot-check event orgId matches host's org

### Post-Migration

- [ ] Verify audit log collection size
- [ ] Test permission checks on migrated events
- [ ] Test audit log queries on migrated data
- [ ] Enable RBAC enforcement

---

## Rollback Procedures

### Immediate Rollback (Emergency)

If critical issue discovered:

```env
ENABLE_RBAC_ENGINE=false
# Restart app server
# All RBAC checks disabled within 30 seconds
# Legacy checks resume
```

No data is modified. Audit logs remain for investigation.

### Partial Rollback (Single Feature)

If issue isolated to one feature:

```env
# Keep RBAC enabled but disable for specific endpoint
RBAC_EXCLUDE_PATHS=/api/specific/endpoint
```

### Full Rollback (If Needed)

If system-wide issue:

1. Set `ENABLE_RBAC_ENGINE=false`
2. Wait 5 minutes for graceful drain
3. Investigate root cause
4. Fix in staging environment
5. Redeploy and test thoroughly
6. Re-enable `ENABLE_RBAC_ENGINE=true` when confident

No data loss occurs; audit logs are immutable and remain.

---

## Monitoring Dashboard

### Key Metrics

```
Panel 1: Permission Checks
- Total checks (gauge)
- Allowed (green gauge)
- Denied (red gauge)
- Allow/Deny ratio (line chart)

Panel 2: Audit Logging
- Events logged (counter)
- Log write latency (p50/p95/p99)
- Error rate (gauge)

Panel 3: Organization Stats
- Total orgs (gauge)
- Active memberships (gauge)
- Distribution by role (pie chart)

Panel 4: Errors
- Permission errors (line chart)
- Audit log errors (line chart)
- Cross-tenant violations (line chart)
```

### Alerting Rules

```
High Priority:
  PermissionDenials > 5%
    Duration: 15 minutes
    Action: Page on-call, investigate

  CrossTenantAccess (should be 0)
    Condition: Occurs
    Action: Page immediately, investigate breach

  AuditLogErrors > 1%
    Duration: 10 minutes
    Action: Page on-call, check MongoDB

Medium Priority:
  PermissionCheckLatency > 50ms (p95)
    Duration: 30 minutes
    Action: Investigate + optimize

  MissingMembership > 10
    Duration: 1 hour
    Action: Run bootstrap for affected users

Low Priority:
  AuditLogSize > 1TB
    Duration: 1 day
    Action: Review retention policy
```

---

## Performance Targets by Phase

| Phase | Enforcement | Latency Impact | Audit Trail | Expected Issues |
|-------|-------------|----------------|-------------|-----------------|
| 0 | None | 0ms | None | 0 |
| 1 | None (logged only) | < 5ms | Complete | < 1% |
| 2 | Selective | < 10ms | Complete | < 1% |
| 3 | Full | < 10ms | Complete | < 0.5% |

---

## Success Criteria

RBAC is ready for full production when:

✅ **Phase 0**: Infrastructure stable, collections created  
✅ **Phase 1**: Audit logs capturing mutations, zero enforcement errors  
✅ **Phase 2**: Selective endpoints enforcing, < 1% permission denials  
✅ **Phase 3**: All endpoints enforcing, cross-tenant access blocked  

Typical timeline: **3-4 weeks** from deploy to full production.

---

## References

- [RBAC/ABAC Architecture](./RBAC_ABAC_ARCHITECTURE.md)
- [CSV Export Deployment](./CSV_EXPORT_DEPLOYMENT.md)
- [Rate Limiting Deployment](./RATE_LIMITING_DEPLOYMENT.md)
