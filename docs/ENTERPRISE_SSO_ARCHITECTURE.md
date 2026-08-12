# Enterprise SAML 2.0 / OIDC Single Sign-On & SCIM Engine

## Overview

The **Enterprise SSO & SCIM Engine** enables organizations to integrate with enterprise Identity Providers (IdP) like Okta, Azure AD, Ping Identity, and Google Workspace using:
- **SAML 2.0**: XML-based single sign-on protocol
- **OIDC**: OAuth 2.0-based federated identity
- **SCIM 2.0**: Standardized user provisioning and deprovisioning

### Problem Solved

**Before**: Only email/password authentication supported; enterprise customers cannot use corporate IdP  
**After**: Organizations can configure their IdP; users auto-provisioned; sessions revoked on deprovisioning

## Architecture

### SSO Login Flow

```
User login attempt
  ↓
1. Check email domain against configured IdP
  ├─ If domain has IdP → Redirect to SAML/OIDC login
  └─ If no IdP → Show email/password form (existing flow)
  ↓
2a. SAML Flow:
    - Redirect to IdP SSO endpoint
    - User authenticates with IdP
    - IdP posts SAML response to /api/auth/saml/acs
    - Parse assertion, extract attributes
    - Create/update user, auto-assign org membership
    - Create NextAuth JWT session
    
2b. OIDC Flow:
    - Redirect to IdP authorization endpoint
    - User authenticates with IdP
    - IdP redirects to /api/auth/callback/enterprise-oidc with code
    - Exchange code for ID token (server-side)
    - Extract claims, create/update user
    - Create NextAuth JWT session
  ↓
3. Redirect to app with authenticated session
```

### SCIM Provisioning Flow

```
IdP (Okta, Azure AD, etc.)
  ↓
POST /api/scim/v2/Users
  - Create user on first assignment
  - Auto-create in app, assign to org
  
PATCH /api/scim/v2/Users/[id]
  - Update user attributes
  - OR: Set active:false to deprovisioning
    - Mark user inactive
    - Revoke all sessions
    - Blacklist JWT tokens
  
DELETE /api/scim/v2/Users/[id]
  - Deactivate user
  - Revoke sessions
```

## Components

### Models

**Organization.identityProvider** (`src/models/Organization.ts`):
- `type`: "SAML" | "OIDC"
- `enabled`: boolean
- `emailDomain`: "@company.com" (route users to this IdP)
- `config`: SAML config (entryPoint, cert, issuer) or OIDC config (clientId, clientSecret, discoveryUrl)
- `ssoDefaultRole`: Default role for provisioned users (VIEWER, EVENT_MANAGER, ADMIN, OWNER)
- `groupRoleMapping`: { "engineering": "ADMIN", "sales": "EVENT_MANAGER" }
- `autoProvisioningEnabled`: Allow IdP to create users
- `scimBearerTokenHash`: Hashed SCIM authentication token
- `scimTokenCreatedAt`: When token was generated

### Services

**auth-enterprise.ts** (`src/lib/auth-enterprise.ts`):
- `resolveIdentityProviderByEmail(email)` → Find org's IdP by email domain
- `resolveIdentityProviderByOrgId(orgId)` → Get org's IdP configuration
- Helper functions: `isSAMLProvider()`, `isOIDCProvider()`, `isSSOConfigured()`

**enterprise-provisioning.ts** (`src/lib/enterprise-provisioning.ts`):
- `provisionUserFromAssertion(assertion, orgId)` → SAML/OIDC JIT provisioning
- `provisionUserFromSCIM(scimUser, orgId)` → SCIM-initiated provisioning
- `updateUserFromAssertion(userId, assertion)` → Keep user attributes current
- `deactivateUserInOrg(userId, orgId)` → Mark user inactive

**session-management.ts** (`src/lib/session-management.ts`):
- `revokeUserSessions(userId, orgId)` → Invalidate user's JWT tokens
- `isTokenRevoked(userId, orgId, issuedAt)` → Check if token was revoked
- In-memory revocation tracking with TTL

### Endpoints

**SCIM 2.0 Protocol** (`src/app/api/scim/v2/[...scim]/route.ts`):
- `GET /Users` → List users (paginated)
- `POST /Users` → Create user
- `GET /Users/{id}` → Get single user
- `PATCH /Users/{id}` → Update user (including active:false for deprovisioning)
- `DELETE /Users/{id}` → Delete user
- `GET /ServiceProviderConfig` → SCIM metadata

**IdP Configuration** (`src/app/api/organizations/[orgId]/identity-provider/route.ts`):
- `GET` → Retrieve IdP config
- `POST` → Update IdP configuration
- `DELETE` → Disable SSO for org
- `PATCH { action: "generate-scim-token" }` → Generate/rotate SCIM token

## Configuration

### Environment Variables

```env
ENABLE_ENTERPRISE_SSO=false              # Feature flag (default: disabled)
SAML_STRICT=true                         # Enforce SAML security
OIDC_TIMEOUT_SECONDS=30                  # OIDC token exchange timeout
SCIM_RATE_LIMIT=100                      # Requests per minute
SESSION_REVOCATION_ENABLED=true          # Enable session revocation
SESSION_REVOCATION_TTL_HOURS=168         # Keep revocation info for 1 week
```

### Organization Configuration

Org owners can configure SSO via API:
```json
{
  "type": "SAML",
  "emailDomain": "@acme.com",
  "enabled": true,
  "config": {
    "entryPoint": "https://acme.okta.com/app/123/sso/saml",
    "cert": "-----BEGIN CERTIFICATE-----...",
    "issuer": "https://acme.okta.com"
  },
  "ssoDefaultRole": "EVENT_MANAGER",
  "groupRoleMapping": {
    "admin": "ADMIN",
    "engineering": "EVENT_MANAGER"
  },
  "autoProvisioningEnabled": true
}
```

## Supported Identity Providers

- **Okta** (SAML, OIDC, SCIM)
- **Azure AD / Entra ID** (SAML, OIDC, SCIM)
- **Ping Identity** (SAML, OIDC, SCIM)
- **Google Workspace** (OIDC, SCIM)
- **OneLogin** (SAML, OIDC, SCIM)
- Any SAML 2.0 / OIDC / SCIM-compliant IdP

## Performance Characteristics

| Operation | Target | Notes |
|-----------|--------|-------|
| IdP resolution | < 10ms | Indexed by email domain |
| SAML assertion parsing | < 50ms | Security-validated |
| OIDC token exchange | < 1s | IdP network latency |
| SCIM user create | < 100ms | Database write + membership |
| Session revocation | < 10ms | In-memory lookup |
| JWT validation with revocation | < 2ms | Revocation cache |

## Backward Compatibility

✅ **Zero Breaking Changes**:
- Feature flag defaults to false (email auth remains default)
- Existing email/password login unchanged
- SCIM is separate endpoint with separate auth
- Session revocation is optional
- Can enable/disable at runtime

✅ **Coexistence**:
- Email auth and SSO can both be active
- Users can migrate from email to SSO
- Mixed auth methods in same org supported

## Security Considerations

✅ **SAML**:
- Certificate pinning (verify IdP cert)
- Signed assertions
- Binding validation (HTTP-POST/Redirect)

✅ **OIDC**:
- JWT signature verification
- Token expiry validation
- Client credential security

✅ **SCIM**:
- Bearer token authentication
- Rate limiting (100 req/min default)
- Request logging and audit trail

✅ **Session Revocation**:
- In-memory revocation tracking
- TTL-based cleanup (1 week)
- Atomic token invalidation

## References

- [[ENTERPRISE_SSO_DEPLOYMENT.md]] — Rollout strategy
- [[RBAC_ABAC_ARCHITECTURE.md]] — Org permissions
- [[L2_CACHE_ARCHITECTURE.md]] — Related features
