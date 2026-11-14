# 📖 Complete API Reference Catalog

This document details all external and internal API contracts, route handler signatures, authentication schemes, and webhook events supported by the application.

---

## 1. Authentication & Security Headers

| Route Pattern | Required Header / Cookie | Roles Permitted | Failure Code |
|---|---|---|---|
| `/api/host/*` | Session Cookie (`authjs.session-token`) | `HOST`, `ADMIN` | 401 Unauthorized / 403 Forbidden |
| `/api/mesh/*` | Session Cookie or Bearer Token (`rmsh_...`) | Any authenticated user | 401 Unauthorized |
| `/api/scim/v2/*` | `Authorization: Bearer <SCIM_TOKEN>` | Enterprise Identity Sync | 401 Unauthorized |
| `/api/webhooks/stripe` | `stripe-signature: t=...,v1=...` | Stripe Webhook Dispatcher | 400 Bad Request |

---

## 2. Public Registration & Attendee APIs

### 2.1 Public Event Registration
* **Endpoint**: Server Action on `/events/[slug]` (`registerForEventAction`)
* **Method**: `POST` (Server Action)
* **Payload**:
  ```json
  {
    "eventId": "65b4c9e8f1a23c0012a45b67",
    "name": "Jane Doe",
    "email": "jane@example.com",
    "password": "Password123!"
  }
  ```
* **Response**:
  ```json
  {
    "success": true,
    "message": "Registration successful!",
    "registrationId": "65b4cb10f1a23c0012a45b89"
  }
  ```

---

## 3. Host Management APIs

### 3.1 List Event Registrations
* **Endpoint**: `/api/host/events/[eventId]/registrations`
* **Method**: `GET`
* **Query Parameters**:
  - `page` (number, default: 1)
  - `limit` (number, default: 20, max: 200)
  - `search` (string, optional attendee name/email filter)
  - `status` (`ACTIVE` | `CANCELLED`, default: `ACTIVE`)
  - `sort` (`newest` | `oldest` | `alpha`, default: `newest`)
* **Response (200 OK)**:
  ```json
  {
    "total": 42,
    "page": 1,
    "limit": 20,
    "data": [
      {
        "id": "65b4cb10f1a23c0012a45b89",
        "status": "ACTIVE",
        "registeredAt": "2026-11-14T18:00:00.000Z",
        "attendee": {
          "id": "65b4ca00f1a23c0012a45b70",
          "name": "Jane Doe",
          "email": "jane@example.com"
        }
      }
    ]
  }
  ```

### 3.2 Cancel Attendee Registration (Host Revocation)
* **Endpoint**: `/api/host/events/[eventId]/registrations?registrationId={id}`
* **Method**: `DELETE`
* **Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Registration cancelled successfully."
  }
  ```

### 3.3 Trigger Asynchronous CSV Export Job
* **Endpoint**: `/api/host/events/[eventId]/registrations/export`
* **Method**: `POST`
* **Payload**:
  ```json
  {
    "mode": "detailed",
    "search": "engineering"
  }
  ```
* **Response (202 Accepted)**:
  ```json
  {
    "jobId": "exp_8f1a23c0012a45b67",
    "status": "queued",
    "pollUrl": "/api/jobs/exp_8f1a23c0012a45b67"
  }
  ```

### 3.4 Poll Export Job Status & Fetch Pre-signed S3 URL
* **Endpoint**: `/api/jobs/[jobId]`
* **Method**: `GET`
* **Response (200 OK - In Progress)**:
  ```json
  {
    "jobId": "exp_8f1a23c0012a45b67",
    "status": "processing",
    "rowCount": 0,
    "elapsedSeconds": 3
  }
  ```
* **Response (200 OK - Completed)**:
  ```json
  {
    "jobId": "exp_8f1a23c0012a45b67",
    "status": "completed",
    "rowCount": 1450,
    "completedAt": "2026-11-14T18:05:00.000Z",
    "downloadUrl": "https://evenregman-exports.s3.amazonaws.com/exports/xyz.csv?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=...&X-Amz-Expires=900...",
    "expiresInSeconds": 895
  }
  ```

---

## 4. ResMesh Compute & Environment Mesh APIs

### 4.1 Acquire Compute Slot / Environment Lease
* **Endpoint**: `/api/mesh/leases`
* **Method**: `POST`
* **Payload**:
  ```json
  {
    "resourceId": "65b4c9e8f1a23c0012a45b67",
    "leaseDurationMinutes": 60
  }
  ```
* **Response (201 Created)**:
  ```json
  {
    "success": true,
    "message": "Lease granted successfully for 60 minutes.",
    "leaseId": "65b4d001f1a23c0012a45c00",
    "leaseToken": "rmsh_a8f9c1e402b8d77a94ef113098",
    "expiresAt": "2026-11-14T19:00:00.000Z"
  }
  ```

### 4.2 Extend or Early-Release Compute Lease
* **Endpoint**: `/api/mesh/leases`
* **Method**: `PATCH`
* **Payload (Extend)**:
  ```json
  {
    "leaseId": "65b4d001f1a23c0012a45c00",
    "action": "EXTEND",
    "extendMinutes": 30
  }
  ```
* **Payload (Release)**:
  ```json
  {
    "leaseId": "65b4d001f1a23c0012a45c00",
    "action": "RELEASE"
  }
  ```
* **Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Lease released successfully."
  }
  ```

### 4.3 Real-Time Server-Sent Events (SSE) Audit Feed
* **Endpoint**: `/api/mesh/sse/audit`
* **Method**: `GET`
* **Headers**: `Accept: text/event-stream`
* **Event Stream Sample**:
  ```text
  data: {"id":"65b4d100","action":"LEASE_ACQUIRED","actorEmail":"dev@acme.corp","targetType":"RESOURCE","targetId":"h100-cluster-us-east","timestamp":"2026-11-14T18:00:00.000Z"}

  data: {"id":"65b4d105","action":"LEASE_EXPIRED","actorEmail":"system-reaper","targetType":"RESOURCE","targetId":"h100-cluster-us-east","timestamp":"2026-11-14T19:00:00.000Z"}
  ```

---

## 5. Enterprise SCIM v2 Directory Provisioning

* **Base Route**: `/api/scim/v2/[...scim]`
* **Authentication**: `Authorization: Bearer <SCIM_TOKEN>` (Hashed SHA-256 against `OrganizationModel.scimTokenHash`)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/scim/v2/Users` | Paginated user lookup (`startIndex`, `count`, filter by `userName`). |
| `GET` | `/api/scim/v2/Users/{id}` | Single user directory profile lookup. |
| `POST` | `/api/scim/v2/Users` | Create new enterprise user account and auto-assign organization membership. |
| `PATCH` | `/api/scim/v2/Users/{id}` | Deactivate (`active: false`) or update enterprise user profile. |
| `DELETE` | `/api/scim/v2/Users/{id}` | Hard delete or revoke enterprise access. |

---

## 6. Stripe Webhooks

* **Endpoint**: `/api/webhooks/stripe`
* **Method**: `POST`
* **Header Requirement**: `stripe-signature`
* **Handled Event Types**:
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_succeeded`
  - `invoice.payment_failed`

