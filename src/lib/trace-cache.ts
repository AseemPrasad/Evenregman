import { SpanStatusCode } from '@opentelemetry/api';
import { getTracer } from './telemetry';
import { env } from './env';

export interface CacheOperation {
  key: string;
  operation: 'get' | 'set' | 'del' | 'delPattern';
  cacheLayer?: 'L1' | 'L2';
  ttl?: number;
}

export async function withCacheSpan<T>(
  operation: CacheOperation,
  callback: () => Promise<T> | T,
): Promise<T> {
  if (!env.ENABLE_OTEL_TRACING) {
    return callback();
  }

  const tracer = getTracer();
  const spanName = `cache.${operation.operation}`;

  return tracer.startActiveSpan(spanName, async (span) => {
    const startTime = Date.now();

    try {
      span.setAttributes({
        'cache.key': operation.key,
        'cache.operation': operation.operation,
        'cache.layer': operation.cacheLayer || 'unknown',
      });

      if (operation.ttl !== undefined) {
        span.addEvent('cache.ttl', {
          'ttl.seconds': operation.ttl,
        });
      }

      const result = await callback();

      const duration = Date.now() - startTime;
      span.addEvent('cache.operation.complete', {
        'duration.ms': duration,
      });

      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'Cache operation error',
      });
      span.addEvent('cache.error', {
        'error.type': error instanceof Error ? error.name : 'Error',
        'error.message': error instanceof Error ? error.message : String(error),
        'duration.ms': duration,
      });
      throw error;
    }
  });
}

export async function traceCacheGet<T>(key: string, callback: () => Promise<T>, cacheLayer: 'L1' | 'L2' = 'L1'): Promise<T> {
  return withCacheSpan({ key, operation: 'get', cacheLayer }, callback);
}

export async function traceCacheSet<T>(
  key: string,
  ttl: number | undefined,
  callback: () => Promise<T>,
  cacheLayer: 'L1' | 'L2' = 'L1',
): Promise<T> {
  return withCacheSpan({ key, operation: 'set', cacheLayer, ttl }, callback);
}

export async function traceCacheDel<T>(
  key: string,
  callback: () => Promise<T>,
  cacheLayer: 'L1' | 'L2' = 'L1',
): Promise<T> {
  return withCacheSpan({ key, operation: 'del', cacheLayer }, callback);
}

export async function traceCacheDelPattern<T>(
  pattern: string,
  callback: () => Promise<T>,
  cacheLayer: 'L1' | 'L2' = 'L1',
): Promise<T> {
  return withCacheSpan({ key: pattern, operation: 'delPattern', cacheLayer }, callback);
}

export function recordCacheHit(key: string, cacheLayer: 'L1' | 'L2' = 'L1'): void {
  if (!env.ENABLE_OTEL_TRACING) {
    return;
  }

  const tracer = getTracer();
  tracer.startSpan('cache.hit', {
    attributes: {
      'cache.key': key,
      'cache.layer': cacheLayer,
      'cache.hit': true,
    },
  }).end();
}

export function recordCacheMiss(key: string, cacheLayer: 'L1' | 'L2' = 'L1'): void {
  if (!env.ENABLE_OTEL_TRACING) {
    return;
  }

  const tracer = getTracer();
  tracer.startSpan('cache.miss', {
    attributes: {
      'cache.key': key,
      'cache.layer': cacheLayer,
      'cache.hit': false,
    },
  }).end();
}
