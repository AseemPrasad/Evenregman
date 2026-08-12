import { SpanStatusCode } from '@opentelemetry/api';
import { getTracer } from './telemetry';
import { env } from './env';

export interface DBOperationContext {
  collection?: string;
  operation?: string;
  query?: string;
  filter?: Record<string, any>;
  update?: Record<string, any>;
}

export async function withDBSpan<T>(
  operationName: string,
  context: DBOperationContext,
  callback: () => Promise<T> | T,
): Promise<T> {
  if (!env.ENABLE_OTEL_TRACING) {
    return callback();
  }

  const tracer = getTracer();
  const spanName = `db.${context.operation || operationName}`;

  return tracer.startActiveSpan(spanName, async (span) => {
    const startTime = Date.now();

    try {
      span.setAttributes({
        'db.system': 'mongodb',
        'db.mongodb.collection': context.collection || 'unknown',
        'db.operation': context.operation || operationName,
      });

      if (context.filter) {
        span.addEvent('db.filter', {
          filter: JSON.stringify(context.filter),
        });
      }

      if (context.update) {
        span.addEvent('db.update', {
          update: JSON.stringify(context.update),
        });
      }

      const result = await callback();

      const duration = Date.now() - startTime;
      span.addEvent('db.query.complete', {
        'duration.ms': duration,
      });

      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'Database error',
      });
      span.addEvent('db.error', {
        'error.type': error instanceof Error ? error.name : 'Error',
        'error.message': error instanceof Error ? error.message : String(error),
        'duration.ms': duration,
      });
      throw error;
    }
  });
}

export async function traceFind<T>(
  collection: string,
  filter: Record<string, any>,
  callback: () => Promise<T>,
): Promise<T> {
  return withDBSpan('find', { collection, operation: 'find', filter }, callback);
}

export async function traceFindOne<T>(
  collection: string,
  filter: Record<string, any>,
  callback: () => Promise<T>,
): Promise<T> {
  return withDBSpan('findOne', { collection, operation: 'findOne', filter }, callback);
}

export async function traceFindByIdAndUpdate<T>(
  collection: string,
  id: string,
  update: Record<string, any>,
  callback: () => Promise<T>,
): Promise<T> {
  return withDBSpan('findByIdAndUpdate', { collection, operation: 'findByIdAndUpdate', update }, callback);
}

export async function traceInsertOne<T>(
  collection: string,
  document: Record<string, any>,
  callback: () => Promise<T>,
): Promise<T> {
  return withDBSpan('insertOne', { collection, operation: 'insertOne' }, callback);
}

export async function traceDeleteMany<T>(
  collection: string,
  filter: Record<string, any>,
  callback: () => Promise<T>,
): Promise<T> {
  return withDBSpan('deleteMany', { collection, operation: 'deleteMany', filter }, callback);
}
