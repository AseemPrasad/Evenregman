import { SpanStatusCode, context } from '@opentelemetry/api';
import { getTracer } from './telemetry';
import { env } from './env';

export interface ErrorContext {
  message?: string;
  cause?: string;
  code?: string;
  statusCode?: number;
  userId?: string;
  orgId?: string;
}

export function recordException(error: Error | unknown, ctx?: ErrorContext): void {
  if (!env.ENABLE_OTEL_TRACING) {
    return;
  }

  try {
    const tracer = getTracer();
    const span = context.active()?.getSpan?.();

    if (!span) {
      return;
    }

    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : 'Unknown error',
    });

    const errorType = error instanceof Error ? error.name : 'Error';
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : '';

    span.addEvent('exception', {
      'exception.type': errorType,
      'exception.message': errorMessage,
      'exception.stacktrace': errorStack,
      'error.kind': ctx?.code || errorType,
      'http.status_code': ctx?.statusCode || 500,
      'user.id': ctx?.userId || 'unknown',
      'org.id': ctx?.orgId || 'unknown',
    });
  } catch (err) {
    console.error('[OTel] Error recording exception:', err);
  }
}

export async function withErrorTracking<T>(
  callback: () => Promise<T> | T,
  operationName?: string,
  ctx?: ErrorContext,
): Promise<T> {
  if (!env.ENABLE_OTEL_TRACING) {
    return callback();
  }

  const tracer = getTracer();
  const spanName = operationName || 'operation';

  return tracer.startActiveSpan(spanName, async (span) => {
    try {
      if (ctx?.userId) span.setAttribute('user.id', ctx.userId);
      if (ctx?.orgId) span.setAttribute('org.id', ctx.orgId);
      if (ctx?.statusCode) span.setAttribute('http.status_code', ctx.statusCode);

      return await callback();
    } catch (error) {
      recordException(error, ctx);
      throw error;
    }
  });
}

export function setErrorContext(userId?: string, orgId?: string): void {
  if (!env.ENABLE_OTEL_TRACING) {
    return;
  }

  try {
    const span = context.active()?.getSpan?.();
    if (!span) return;

    if (userId) span.setAttribute('user.id', userId);
    if (orgId) span.setAttribute('org.id', orgId);
  } catch (err) {
    console.error('[OTel] Error setting context:', err);
  }
}

export class TracedError extends Error {
  constructor(
    message: string,
    public code?: string,
    public statusCode: number = 500,
    public userId?: string,
    public orgId?: string,
  ) {
    super(message);
    this.name = 'TracedError';

    if (env.ENABLE_OTEL_TRACING) {
      recordException(this, { code, statusCode, userId, orgId });
    }
  }
}
