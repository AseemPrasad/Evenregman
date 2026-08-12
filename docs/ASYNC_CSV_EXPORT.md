# Asynchronous Bulk CSV Export Engine

## Overview

The **Asynchronous Bulk CSV Export Engine** converts synchronous CSV export (which blocks the event loop and times out on large datasets) into a background job system using Redis-backed queues with S3 storage and pre-signed URLs.

### Problem Solved

**Before**: CSV exports block the request and timeout on datasets > 50k rows
**After**: Exports are processed asynchronously; returns 202 Accepted within 50ms

## Architecture

### High-Level Flow

```
1. User requests export
   ↓
2. Endpoint enqueues job → returns 202 Accepted (< 50ms)
   ↓
3. User polls /api/jobs/[jobId] for status
   ↓
4. Worker processes export in background
   - Queries registrations with cursor pagination (500 rows/batch)
   - Streams CSV to S3
   - Generates 15-min pre-signed URL
   ↓
5. When ready, status polling returns downloadUrl
   ↓
6. User downloads from S3 (pre-signed URL expires after 15 min)
```

### Components

#### 1. Export Endpoint (Modified)
**File**: `src/app/api/host/events/[eventId]/registrations/export/route.ts`

**Behavior**:
- If `ENABLE_ASYNC_EXPORTS=false`: Uses sync path (existing behavior)
- If `ENABLE_ASYNC_EXPORTS=true`: Dispatches job, returns 202 Accepted

**Request**:
```
GET /api/host/events/EVENT_ID/registrations/export?mode=name_email&search=foo
```

**Response (202 Accepted)**:
```json
{
  "status": "accepted",
  "jobId": "export-{eventId}-{timestamp}-{random}",
  "statusUrl": "/api/jobs/{jobId}"
}
```

#### 2. Job Queue (`src/lib/queue.ts`)
Redis-backed queue for job management.

**Methods**:
- `enqueueExportJob(jobType, data)` → returns jobId
- `dequeueJob(jobType)` → returns next jobId or null
- `getQueuedJobs(jobType)` → returns all jobIds

**Storage**: Redis ZSET for queue, hash for job data

#### 3. Job Status Endpoint
**File**: `src/app/api/jobs/[jobId]/route.ts`

**Response** (when pending):
```json
{
  "jobId": "...",
  "status": "pending",
  "rowCount": 0,
  "createdAt": "2025-08-12T19:00:00Z"
}
```

**Response** (when processing):
```json
{
  "jobId": "...",
  "status": "processing",
  "rowCount": 1500,
  "startedAt": "2025-08-12T19:00:05Z",
  "elapsedSeconds": 10
}
```

**Response** (when completed):
```json
{
  "jobId": "...",
  "status": "completed",
  "rowCount": 5000,
  "downloadUrl": "https://s3.../export.csv?expires=...",
  "expiresAt": "2025-08-12T19:15:00Z",
  "expiresInSeconds": 300,
  "completedAt": "2025-08-12T19:00:45Z"
}
```

**Response** (when failed):
```json
{
  "jobId": "...",
  "status": "failed",
  "errorMessage": "Database query timeout",
  "failedAt": "2025-08-12T19:00:30Z"
}
```

#### 4. Export Worker (`src/jobs/export-worker.ts`)
Background worker that processes export jobs.

**Algorithm**:
```
1. Dequeue job from Redis
2. Update status → "processing"
3. Query registrations with cursor (batch size: 500)
4. For each batch:
   - Format as CSV
   - Write to S3
   - Update row count
5. Generate pre-signed URL (15-min expiry)
6. Update status → "completed"
   OR on error:
7. Update status → "failed" with error message
```

#### 5. Worker Bootstrap (`src/workers/bootstrap.ts`)
Starts the export worker process.

**Environment Variables**:
- `ENABLE_ASYNC_EXPORTS=true`: Enable async export system
- `ASYNC_EXPORTS_WORKER_ENABLED=true`: Run export worker
- `REDIS_URL`: Redis connection string
- `S3_BUCKET_NAME`: S3 bucket for exports
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`: AWS credentials

**Startup**:
```bash
npm run worker:export
```

#### 6. Export Job Model (`src/models/ExportJob.ts`)
MongoDB schema for persistent job tracking.

**Fields**:
- `jobId` (string, unique)
- `eventId` (ObjectId)
- `hostId` (ObjectId)
- `status` ("pending" | "processing" | "completed" | "failed")
- `s3Key`, `downloadUrl`
- `errorMessage`, `rowCount`
- `createdAt`, `startedAt`, `completedAt`
- `expiresAt` (auto-deletes after 24 hours)

#### 7. S3 Integration (`src/lib/s3.ts`)
AWS S3/Cloudflare R2 abstraction layer.

**Methods**:
- `uploadStreamToS3(key, stream)` → uploads CSV
- `generatePresignedUrl(key, expirationSeconds)` → returns 15-min URL
- `deleteS3Object(key)` → cleanup
- `isS3Configured()` → check if ready

#### 8. Metrics (`src/lib/job-queue-metrics.ts`)
In-memory statistics tracking.

**Metrics**:
- `queued`, `processing`, `completed`, `failed` (counts)
- `avgLatencyMs`, `avgRowCount` (averages)
- `topErrors` (most common failures)

**Endpoint**: `GET /api/metrics/jobs`

## Configuration

### Environment Variables

```env
# Enable async export feature (default: false)
ENABLE_ASYNC_EXPORTS=false

# Enable export worker process (default: false)
ASYNC_EXPORTS_WORKER_ENABLED=false

# Redis for job queue (required for async)
REDIS_URL=redis://localhost:6379

# S3/R2 storage (required for async)
S3_BUCKET_NAME=evenregman-exports
S3_REGION=auto
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

## Deployment Phases

### Phase 0: Baseline (Week 1)
```env
ENABLE_ASYNC_EXPORTS=false
ASYNC_EXPORTS_WORKER_ENABLED=false
```
- Code deployed but inactive
- Infrastructure verified (Redis, S3)
- No user impact

### Phase 1: Dry-Run (Week 2)
```env
ENABLE_ASYNC_EXPORTS=true
ASYNC_EXPORTS_WORKER_ENABLED=true
```
- Async exports active
- Monitor: job success rate, S3 uploads, memory usage
- Run for full week
- Verify pre-signed URL expiry working

### Phase 2: Canary (Week 3)
- Same configuration as Phase 1
- Close monitoring for issues
- Rollback condition: > 1% error rate or false positives

### Phase 3: Full Deployment (Week 4+)
- Stable production configuration
- Weekly metric reviews
- Instant rollback via feature flag if needed

## Performance Characteristics

| Operation | Target | Notes |
|-----------|--------|-------|
| Enqueue job | < 50ms | Just Redis push + DB insert |
| Small export (< 1k rows) | < 5s | Memory efficient |
| Medium export (10k rows) | < 30s | Still responsive |
| Large export (100k rows) | < 5 min | Cursor pagination prevents OOM |
| Memory usage | < 100MB | 500-row batch limit |
| Pre-signed URL expiry | 15 min | Secure, time-limited downloads |

## Monitoring

### Health Checks

```bash
# Check export metrics
curl /api/metrics/jobs | jq '.completed'

# Monitor error rates
curl /api/metrics/jobs | jq '.topErrors'

# Check job status
curl /api/jobs/JOBID | jq '.status'
```

### Alerts

```
Alert: ExportJobFailures > 5% in 1 hour
Alert: AverageLatency > 3 min
Alert: S3UploadErrors > 10 in 1 hour
Alert: PreSignedUrlExpired (URL used after expiry)
```

## Error Scenarios

### Database Cursor Fails
- Worker marks job as failed
- Error message saved to job record
- User sees error via status polling
- No auto-retry (investigate manually)

### S3 Upload Fails
- Transient: retry with exponential backoff
- Permanent: mark job as failed
- User can re-export after issue resolves

### Redis Unavailable
- Job enqueue fails → endpoint returns 500
- Worker can't dequeue → no jobs processed
- Gracefully degrades (sync path still works)

### Pre-signed URL Expires
- URL is time-limited (15 minutes)
- User must re-poll status for new URL
- S3 object retained for 24 hours

## Backward Compatibility

✅ Fully backward compatible:
- Feature flag defaults to false (disabled)
- Existing sync export unaffected
- Can enable/disable at runtime (no restart)
- No database migrations required

## Security Considerations

✅ Access Control:
- Status polling requires authentication
- Ownership validated (can only view own jobs)
- jobId is random UUID (not guessable)

✅ Data Privacy:
- Pre-signed URLs are time-limited
- No credentials embedded in URLs
- S3 objects auto-delete after 24 hours
- CSV data never persisted to database

✅ Rate Limiting:
- Existing rate limit policies apply to export endpoint
- Export worker runs at fixed concurrency (prevents abuse)
- Job queue has size limit (prevents memory bloat)

## Troubleshooting

### Exports Not Processing
1. Check `ASYNC_EXPORTS_WORKER_ENABLED=true`
2. Verify `REDIS_URL` is accessible
3. Check worker logs: `npm run worker:export`
4. Verify S3 credentials in environment

### Pre-signed URLs Not Working
1. Check S3 bucket and region match configuration
2. Verify AWS credentials have S3 permissions
3. Check URL not expired (< 15 min old)
4. Check S3 CORS if accessed from browser

### Memory Usage Too High
1. Reduce batch size in JOB_CONFIG (default: 500)
2. Reduce worker concurrency (default: 2)
3. Monitor cursor pagination logs

### Jobs Never Complete
1. Check worker is running: `ps aux | grep worker:export`
2. Check Redis queue has jobs: `redis-cli LLEN queue:export`
3. Check job status in database: `db.exportjobs.findOne({jobId})`

## References

- [[CSV_EXPORT_DEPLOYMENT.md]] — Phased rollout strategy
- [[ATOMIC_REGISTRATIONS.md]] — Related feature (atomic capacity)
- [[RATE_LIMITING.md]] — Rate limiting configuration
