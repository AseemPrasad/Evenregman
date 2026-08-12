import { SpanStatusCode, context } from '@opentelemetry/api';
import { getTracer } from './telemetry';
import { env } from './env';
import { injectTraceContextToJobPayload, extractTraceContextFromJobPayload, TraceHeaders } from './trace-propagation';

export interface TracedJobPayload {
  __trace_context?: {
    traceparent?: string;
    tracestate?: string;
  };
  [key: string]: any;
}

export function withJobTraceContext(payload: Record<string, any>): TracedJobPayload {
  if (!env.ENABLE_OTEL_TRACING) {
    return payload;
  }

  return injectTraceContextToJobPayload(payload);
}

export async function withJobSpan<T>(
  jobType: string,
  traceHeaders: TraceHeaders | undefined,
  callback: () => Promise<T>,
): Promise<T> {
  if (!env.ENABLE_OTEL_TRACING) {
    return callback();
  }

  const tracer = getTracer();
  const spanName = `job.${jobType}`;

  return tracer.startActiveSpan(spanName, async (span) => {
    const startTime = Date.now();

    try {
      span.setAttributes({
        'job.type': jobType,
        'job.status': 'running',
      });

      if (traceHeaders?.traceparent) {
        span.addEvent('trace.link', {
          'parent.traceparent': traceHeaders.traceparent,
        });
      }

      const result = await callback();

      const duration = Date.now() - startTime;
      span.addEvent('job.complete', {
        'duration.ms': duration,
        'job.status': 'success',
      });

      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'Job failed',
      });
      span.addEvent('job.error', {
        'error.type': error instanceof Error ? error.name : 'Error',
        'error.message': error instanceof Error ? error.message : String(error),
        'duration.ms': duration,
        'job.status': 'failed',
      });
      throw error;
    }
  });
}

export async function traceJobProcessor<T>(
  jobData: TracedJobPayload,
  jobType: string,
  processor: () => Promise<T>,
): Promise<T> {
  if (!env.ENABLE_OTEL_TRACING) {
    return processor();
  }

  const traceHeaders = extractTraceContextFromJobPayload(jobData);
  return withJobSpan(jobType, traceHeaders, processor);
}

export function recordJobQueueEvent(
  jobType: string,
  status: 'queued' | 'started' | 'completed' | 'failed',
  details?: Record<string, any>,
): void {
  if (!env.ENABLE_OTEL_TRACING) {
    return;
  }

  try {
    const span = context.active()?.getSpan?.();
    if (!span) return;

    span.addEvent(`job.${status}`, {
      'job.type': jobType,
      'job.status': status,
      ...details,
    });
  } catch (err) {
    console.error('[OTel] Error recording job event:', err);
  }
}

export function recordJobRetry(jobType: string, attempt: number, nextRetryMs: number): void {
  if (!env.ENABLE_OTEL_TRACING) {
    return;
  }

  try {
    const span = context.active()?.getSpan?.();
    if (!span) return;

    span.addEvent('job.retry', {
      'job.type': jobType,
      'retry.attempt': attempt,
      'retry.delay_ms': nextRetryMs,
    });
  } catch (err) {
    console.error('[OTel] Error recording job retry:', err);
  }
}

export function recordJobBatchEvent(jobType: string, processedCount: number, successCount: number, failureCount: number): void {
  if (!env.ENABLE_OTEL_TRACING) {
    return;
  }

  try {
    const span = context.active()?.getSpan?.();
    if (!span) return;

    span.addEvent('job.batch', {
      'job.type': jobType,
      'batch.total': processedCount,
      'batch.success': successCount,
      'batch.failure': failureCount,
    });
  } catch (err) {
    console.error('[OTel] Error recording batch event:', err);
  }
}
