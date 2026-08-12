# Enterprise SSO Deployment & Rollout Strategy

## Phased Rollout Plan

### Phase 0: Infrastructure (Week 1)

**Configuration**:
```env
ENABLE_ENTERPRISE_SSO=false
```

**What happens**:
- SSO code deployed but completely inactive
- Zero impact on existing flows
- Infrastructure verified (IdP config storage, SCIM endpoints)
- Documentation reviewed

**Success Criteria**:
- No errors in logs
- Email/password auth unaffected
- Feature flag proven disabled

---

### Phase 1: Pilot Organization (Week 2)

**Configuration**:
```env
ENABLE_ENTERPRISE_SSO=true
```

**What happens**:
- Single pilot org configures SAML/OIDC IdP
- Users can login via SSO
- SCIM provisioning tested end-to-end
- No rollout to other orgs

**Validation**:
- ✅ Users can login with SAML assertion
- ✅ JWT sessions created correctly
- ✅ SCIM provisioning creates users
- ✅ SCIM active:false revokes sessions
- ✅ Session revocation prevents re-access
- ✅ Email auth still works for other users

**Success Criteria**:
- SSO login works
- Sessions valid and revocable
- No impact on email auth
- SCIM token generation works

---

### Phase 2: Enterprise Rollout (Week 3)

**Configuration** (same):
```env
ENABLE_ENTERPRISE_SSO=true
```

**What happens**:
- Multiple enterprise orgs can configure IdP
- Email domain routing works correctly
- SCIM integrations with different IdPs tested
- Production monitoring active

**Validation**:
- ✅ Okta SAML integration
- ✅ Azure AD OIDC integration
- ✅ Google Workspace SCIM
- ✅ Group-to-role mapping
- ✅ Concurrent SCIM requests

**Success Criteria**:
- Multiple IdPs working simultaneously
- No cross-org data leakage
- SCIM handles high throughput
- Session revocation instant

---

### Phase 3: Production Stable (Week 4+)

**Configuration** (stable):
```env
ENABLE_ENTERPRISE_SSO=true
SESSION_REVOCATION_ENABLED=true
```

**What happens**:
- Enterprise SSO generally available
- All orgs can enable SSO
- Ongoing support and optimization
- Certificate rotation automated

**Maintenance Tasks**:
- Weekly: Review SCIM errors, IdP logs
- Monthly: Audit SCIM tokens, session revocations
- Quarterly: Review IdP configurations

---

## Monitoring

### Key Metrics

```
- SSO login success rate (target: > 99%)
- SAML assertion parse errors
- OIDC token exchange latency
- SCIM provisioning latency (target: < 100ms)
- Session revocation events
- IdP certificate expiry warnings
```

### Alerts

```
Alert: SSO_Login_Failure_Rate > 5%
Alert: SCIM_Error_Rate > 1%
Alert: IdP_Certificate_Expires_Soon (< 30 days)
Alert: SessionRevocation_Latency > 100ms
Alert: UnauthorizedSCIMRequests > 10/minute
```

---

## Rollback Procedures

### Immediate Rollback

If critical issue found:

```env
ENABLE_ENTERPRISE_SSO=false
# Restart app server
# Email auth resumes for all users
```

Changes take effect immediately (no restart needed for reads, restart for consistency).

### Disable SCIM Only

If SCIM issues found:

```
PATCH /api/organizations/[orgId]/identity-provider
{ "autoProvisioningEnabled": false }
```

Or disable IdP:

```
DELETE /api/organizations/[orgId]/identity-provider
```

---

## Troubleshooting

### SAML Assertion Not Parsing
- Verify certificate format (PEM)
- Check cert hasn't expired
- Validate XML structure in logs
- Confirm binding type (HTTP-POST)

### OIDC Token Exchange Fails
- Verify client credentials
- Check discovery URL accessible
- Validate redirect URI matches IdP
- Review IdP logs for errors

### SCIM Provisioning Hangs
- Check bearer token valid
- Verify rate limit not exceeded
- Review database connection
- Check for MongoDB locking

### Session Revocation Not Working
- Verify SESSION_REVOCATION_ENABLED=true
- Check token was revoked (not expired)
- Validate middleware checks revocation
- Check TTL cleanup running

---

## Support Runbook

### Customer reports "can't login with SSO"

1. Check IdP is enabled: `GET /api/organizations/[orgId]/identity-provider`
2. Verify email domain matches config
3. Test SAML assertion parsing in staging
4. Ask customer: did IdP show login screen?
5. If no: IdP endpoint URL wrong
6. If yes but failed: cert/issuer mismatch

### Customer reports "user still has access after deprovisioning"

1. Confirm SCIM PATCH active:false sent
2. Check session revocation executed
3. Verify user's JWT tokens in memory
4. Ask customer: did they clear browser cache/cookies?
5. If still access: revocation might have failed, retry

### "SCIM provisioning taking too long"

1. Check database query performance
2. Verify no locking issues
3. Review SCIM rate limit (100/min default)
4. Check network latency to IdP
5. Consider batch SCIM if > 1000 users

---

## Deployment Checklist

### Pre-Deployment

- [ ] Code reviewed and tested
- [ ] SAML/OIDC libraries available
- [ ] SCIM protocol implementation verified
- [ ] Documentation complete
- [ ] Support team trained
- [ ] Monitoring configured
- [ ] Rollback procedure documented

### Phase 0 Deployment

- [ ] Deploy with `ENABLE_ENTERPRISE_SSO=false`
- [ ] Verify no errors
- [ ] Confirm email auth still works

### Phase 1 Deployment

- [ ] Select pilot org
- [ ] Configure IdP credentials
- [ ] Test SAML/OIDC login
- [ ] Test SCIM provisioning
- [ ] Verify session revocation

### Phase 2 Deployment

- [ ] Enable for multiple orgs
- [ ] Test different IdP types
- [ ] Monitor error rates
- [ ] Have rollback ready

### Phase 3 Deployment

- [ ] Monitor continuously
- [ ] Collect feedback
- [ ] Optimize certificate rotation
- [ ] Plan certificate renewal schedule

---

## Success Criteria

Enterprise SSO is production-ready when:

✅ **Phase 0**: Code stable, email auth unaffected  
✅ **Phase 1**: SSO and SCIM working end-to-end  
✅ **Phase 2**: Multiple IdPs coexisting safely  
✅ **Phase 3**: Production stable, < 1% error rate  

Typical timeline: **3-4 weeks** from code deploy to full production.
