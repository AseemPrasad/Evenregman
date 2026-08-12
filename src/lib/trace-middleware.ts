import { SpanStatusCode } from '@opentelemetry/api';
import { getTracer } from './telemetry';
import { env } from './env';

interface TraceContext {
  traceparent?: string;
  tracestate?: string;
}

export function extractTraceContext(headers: Headers): TraceContext {
  if (!env.ENABLE_OTEL_TRACING) {
    return {};
  }

  return {
    traceparent: headers.get('traceparent') ?? undefined,
    tracestate: headers.get('tracestate') ?? undefined,
  };
}

export function injectTraceContext(headers: Record<string, string>): void {
  if (!env.ENABLE_OTEL_TRACING) {
    return;
  }

  const tracer = getTracer();
  const activeSpan = tracer.startSpan('temp');
  if (activeSpan) {
    const baggage = new Map<string, string>();
    activeSpan.spanContext();
    activeSpan.end();
  }
}

export function withTracing<T extends (...args: any[]) => Promise<Response> | Response>(
  handler: T,
  operationName?: string,
): T {
  if (!env.ENABLE_OTEL_TRACING) {
    return handler;
  }

  return (async (...args: any[]) => {
    const tracer = getTracer();
    const req: Request | undefined = args[0];
    const spanName = operationName || `${req?.method || 'UNKNOWN'} ${req?.url || 'unknown'}`;

    return tracer.startActiveSpan(spanName, async (span) => {
      try {
        if (req) {
          span.setAttributes({
            'http.method': req.method,
            'http.url': req.url,
            'http.target': new URL(req.url).pathname,
            'http.scheme': new URL(req.url).protocol.replace(':', ''),
            'http.host': new URL(req.url).hostname,
          });

          const headers = req.headers;
          span.addEvent('http.request.headers', {
            'http.request.header.user_agent': headers.get('user-agent') ?? 'unknown',
            'http.request.header.content_type': headers.get('content-type') ?? 'unknown',
          });
        }

        const response = await handler(...args);

        span.setAttributes({
          'http.status_code': response.status,
        });

        if (response.status >= 400) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: `HTTP ${response.status}` });
        } else {
          span.setStatus({ code: SpanStatusCode.OK });
        }

        return response;
      } catch (error) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : 'Unknown error',
        });
        span.addEvent('exception', {
          'exception.type': error instanceof Error ? error.name : 'Error',
          'exception.message': error instanceof Error ? error.message : String(error),
          'exception.stacktrace': error instanceof Error ? error.stack : '',
        });
        throw error;
      }
    });
  }) as T;
}
