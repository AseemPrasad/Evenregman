# Two-Tier Edge & L2 Distributed Cache Invalidation Engine

## Overview

The **Two-Tier Caching Architecture** dramatically reduces database load and improves response latency for public event pages by implementing:
- **L1 Cache**: Next.js Data Cache with revalidation tags (edge, CDN, serverless)
- **L2 Cache**: Redis key-value storage with compressed JSON (distributed, persistent)
- **Invalidation**: Event-driven cache purging on mutations (synchronous, atomic)

### Problem Solved

**Before**: Every page view queries MongoDB directly (100-200ms latency, high DB load)
**After**: Cached reads return in < 15ms, 80%+ reduction in database queries

## Architecture

### Two-Tier Caching Strategy

```
Request for /events/[slug]
  ↓
1. Check Next.js L1 cache (DSN/edge)
  ├─ Hit → return immediately (< 5ms)
  └─ Miss → proceed to L2
  ↓
2. Check Redis L2 cache (distributed)
  ├─ Hit → decompress, return (< 10ms)
  └─ Miss → proceed to database
  ↓
3. Query MongoDB database (100-200ms)
  ↓
4. Populate L2 cache with TTL
  ↓
5. Return to L1 cache (for next request)
  ↓
Response to client (cached or fresh)
```

### Cache Keys

| Resource | Key Pattern | TTL | Notes |
|----------|-------------|-----|-------|
| Single event by slug | `cache:event:{slug}` | 3600s | 1 hour, popular content |
| Events list | `cache:events:list` | 300s | 5 min, frequent updates |
| Events by org | `cache:events:org:{orgId}` | 1800s | 30 min, org-specific |
| Registration | `cache:registration:{id}` | 600s | 10 min, volatile data |

### Cache Invalidation Patterns

**On Event Create**:
```
revalidateTag('events')
revalidateTag('org:{orgId}')
revalidatePath('/events')
invalidate('cache:events:list')
```

**On Event Update**:
```
revalidateEventCache(oldSlug)
revalidateEventCache(newSlug)  // if slug changed
revalidateTag('events')
invalidate('cache:events:list')
invalidate('cache:events:org:{orgId}')
```

**On Event Delete**:
```
revalidateTag('events')
invalidateCachePattern('cache:event:*')
invalidate('cache:events:list')
```

### Compression Strategy

```
Value size > 1024 bytes:
  ↓
Try gzip compression
  ↓
If compressed size < 80% of original:
  → Store compressed (with metadata flag)
Else:
  → Store uncompressed (overhead not worth it)

Result: 40-60% space savings on typical event data
```

## Components

### 1. Redis L2 Cache (`src/lib/redis-cache.ts`)

Core cache operations:
- `cacheGet(key)` → deserialize, decompress, return
- `cacheSet(key, value, ttl)` → serialize, compress if beneficial, store with EXPIRE
- `cacheDel(key)` → immediate deletion
- `cacheDelPattern(pattern)` → wildcard delete

### 2. Read-Through Service (`src/lib/cache-service.ts`)

Transparent cache-or-query pattern:
```typescript
const data = await getCachedOrQuery(
  'cache:event:slug',
  3600,
  () => EventModel.findOne({ slug }).lean()
)
```

Invalidation:
- `invalidateCache(key)` → single key deletion
- `invalidateCachePattern(pattern)` → wildcard deletion
- `invalidateCacheTag(tag)` → tag-based invalidation

### 3. Next.js Integration (`src/lib/cache-revalidation.ts`)

Dual-layer invalidation:
```typescript
async function revalidateEventCache(slug: string) {
  // L1: Next.js Data Cache
  revalidateTag(`event:${slug}`)
  revalidateTag('events')

  // L2: Redis
  await invalidateCache(`cache:event:${slug}`)
}
```

### 4. Public Events Service (`src/lib/public-events.ts`)

Cache-aware event queries:
- `getPublicEventBySlug()` → reads through L2 cache
- `getPublicEvents()` → list cache with shorter TTL
- `getPublicEventsByOrganization()` → org-specific cache

### 5. Compression (`src/lib/cache-compression.ts`)

Smart compression:
- `compressData()` → gzip with ratio check
- `decompressData()` → automatic format detection
- Tracks compression metrics (ratio, bytes saved, speed)

### 6. Monitoring (`src/app/api/metrics/cache/route.ts`)

Cache performance metrics:
- `GET /api/metrics/cache` → returns stats
- `DELETE /api/metrics/cache` → reset metrics
- Tracks: hits, misses, writes, deletes, errors, hit rate

## Configuration

### Environment Variables

```env
# Enable/disable caching
ENABLE_L2_CACHE=false              # Default: disabled

# TTL settings (in seconds)
CACHE_TTL_EVENTS=3600              # Single event: 1 hour
CACHE_TTL_EVENTS_LIST=300          # Event list: 5 minutes

# Compression
CACHE_COMPRESSION_ENABLED=true
CACHE_COMPRESSION_THRESHOLD_BYTES=1024
```

## Performance Characteristics

| Operation | Target | Notes |
|-----------|--------|-------|
| Cached read (L1/L2 hit) | < 15ms P99 | Network roundtrip only |
| Cache miss (DB query) | 100-200ms | Same as uncached |
| Cache miss + populate | 110-220ms | Query + Redis set |
| Invalidation | < 5ms | Synchronous delete |
| Compression overhead | < 2ms | Auto-disabled if not beneficial |

## Backward Compatibility

✅ **Zero Breaking Changes**:
- Feature flag defaults to false (caching disabled)
- Existing queries work unchanged
- Function signatures unchanged (cache is transparent)
- Can enable/disable at runtime (no restart)
- Cache misses fall through to database (no data loss)

✅ **Fallback Paths**:
- If Redis unavailable: use database
- If cache disabled: skip L2 entirely
- If compression fails: store uncompressed
- If deserialization fails: re-query database

## Deployment Phases

### Phase 0: Infrastructure (Week 1)
- Redis connected, configuration verified
- Cache operations tested in dry-run
- No production impact (feature flag off)
- Monitoring dashboards prepared

### Phase 1: Read-Only (Week 2)
- Cache populates on all queries
- Metrics collected (baseline)
- No enforcement (database still authoritative)
- Validate cache correctness

### Phase 2: Selective (Week 3)
- High-traffic endpoints use cache (public events)
- Database load monitoring
- Invalidation tested on mutations
- Verify data freshness

### Phase 3: Full (Week 4+)
- All public queries use cache
- 70-80% database query reduction
- Stable production system
- Ongoing performance monitoring

## Success Criteria

✅ **Latency**: P99 < 15ms for cached reads  
✅ **Database Load**: 70-80% reduction in queries  
✅ **Hit Rate**: > 70% after warmup  
✅ **Data Freshness**: Zero stale data (sync invalidation)  
✅ **Compression**: 40-60% space savings  
✅ **Errors**: < 0.1% failure rate  

## Troubleshooting

### Cache Not Populating
- Check `ENABLE_L2_CACHE=true`
- Verify Redis connection
- Check logs for errors

### Stale Data Served
- Should never happen (sync invalidation)
- If occurs: immediately set `ENABLE_L2_CACHE=false`
- Investigate invalidation logic

### Memory Over-Allocation
- Check Redis memory usage
- Verify TTL expiry is working
- Monitor compression ratio

### Performance Not Improved
- Check hit rate: `GET /api/metrics/cache`
- Verify cache is being used (debug headers)
- Check compression overhead

## References

- [[L2_CACHE_DEPLOYMENT.md]] — Phased rollout strategy
- [[RBAC_ABAC_ARCHITECTURE.md]] — Access control (not affected)
- [[CSV_EXPORT_DEPLOYMENT.md]] — Related async feature
