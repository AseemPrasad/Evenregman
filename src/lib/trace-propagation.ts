import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { context } from '@opentelemetry/api';
import { env } from './env';

const propagator = new W3CTraceContextPropagator();

export interface TraceHeaders {
  traceparent?: string;
  tracestate?: string;
}

export function extractTraceContext(headers: Record<string, string | string[] | undefined>): TraceHeaders {
  if (!env.ENABLE_OTEL_TRACING) {
    return {};
  }

  return {
    traceparent: String(headers['traceparent'] || headers['trace-parent'] || ''),
    tracestate: String(headers['tracestate'] || headers['trace-state'] || ''),
  };
}

export function injectTraceContext(headers: Record<string, string>): Record<string, string> {
  if (!env.ENABLE_OTEL_TRACING) {
    return headers;
  }

  try {
    const carrier: Record<string, string> = { ...headers };

    propagator.inject(context.active(), carrier, {
      get: (obj, key) => obj[key],
      set: (obj, key, value) => {
        obj[key] = String(value);
      },
    });

    return carrier;
  } catch (err) {
    console.error('[OTel] Error injecting trace context:', err);
    return headers;
  }
}

export function injectTraceContextToFetch(init?: RequestInit): RequestInit {
  if (!env.ENABLE_OTEL_TRACING) {
    return init || {};
  }

  const headers = new Headers(init?.headers);
  const injected = injectTraceContext(Object.fromEntries(headers.entries()));

  return {
    ...init,
    headers: injected,
  };
}

export async function fetchWithTrace(
  url: string | URL,
  init?: RequestInit,
): Promise<Response> {
  if (!env.ENABLE_OTEL_TRACING) {
    return fetch(url, init);
  }

  const traceInit = injectTraceContextToFetch(init);
  return fetch(url, traceInit);
}

export function injectTraceContextToJobPayload(payload: Record<string, any>): Record<string, any> {
  if (!env.ENABLE_OTEL_TRACING) {
    return payload;
  }

  try {
    const headers: Record<string, string> = {};
    propagator.inject(context.active(), headers, {
      get: (obj, key) => obj[key],
      set: (obj, key, value) => {
        obj[key] = String(value);
      },
    });

    return {
      ...payload,
      __trace_context: {
        traceparent: headers['traceparent'],
        tracestate: headers['tracestate'],
      },
    };
  } catch (err) {
    console.error('[OTel] Error injecting trace context to job:', err);
    return payload;
  }
}

export function extractTraceContextFromJobPayload(payload: Record<string, any>): TraceHeaders {
  if (!env.ENABLE_OTEL_TRACING) {
    return {};
  }

  const traceContext = payload?.__trace_context;
  if (!traceContext) {
    return {};
  }

  return {
    traceparent: traceContext.traceparent,
    tracestate: traceContext.tracestate,
  };
}

export function linkTraceContextToJob(
  parentTraceHeaders: TraceHeaders,
  jobPayload: Record<string, any>,
): Record<string, any> {
  if (!env.ENABLE_OTEL_TRACING) {
    return jobPayload;
  }

  return {
    ...jobPayload,
    __trace_context: {
      traceparent: parentTraceHeaders.traceparent,
      tracestate: parentTraceHeaders.tracestate,
    },
  };
}
