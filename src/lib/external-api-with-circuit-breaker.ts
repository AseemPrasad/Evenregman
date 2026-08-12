import { createCircuitBreaker, isCircuitBreakerEnabled, CircuitBreakerOpenError } from './circuit-breaker';
import { createCircuitBreakerConfig, CircuitBreakerPreset } from './circuit-breaker-config';
import { FallbackStrategy, executeFallback } from './fallback-strategies';
import { fallbackQueueService } from './fallback-queue';
import { env } from './env';

export interface ExternalAPICallOptions<T> {
  serviceName: string;
  operationName: string;
  preset?: CircuitBreakerPreset;
  fallbackStrategy?: FallbackStrategy<T>;
  metadata?: Record<string, any>;
}

class ExternalAPIClient {
  private circuitBreakers = new Map<string, any>();

  async executeWithCircuitBreaker<T>(
    fn: () => Promise<T>,
    options: ExternalAPICallOptions<T>,
  ): Promise<T> {
    if (!isCircuitBreakerEnabled()) {
      return fn();
    }

    const circuitBreakerKey = `${options.serviceName}:${options.operationName}`;

    if (!this.circuitBreakers.has(circuitBreakerKey)) {
      const config = createCircuitBreakerConfig(circuitBreakerKey, options.preset || 'normal');
      const breaker = createCircuitBreaker(circuitBreakerKey, fn, config);
      this.circuitBreakers.set(circuitBreakerKey, breaker);
    }

    const breaker = this.circuitBreakers.get(circuitBreakerKey);

    try {
      return await breaker.execute();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      // Try fallback strategy first
      if (options.fallbackStrategy) {
        const fallbackResult = await executeFallback(options.fallbackStrategy, {
          serviceName: options.serviceName,
          operationName: options.operationName,
          requestData: fn.toString(),
          error: err,
          metadata: options.metadata,
        });

        if (fallbackResult !== undefined) {
          return fallbackResult;
        }
      }

      // If circuit breaker open, queue to fallback queue
      if (error instanceof CircuitBreakerOpenError && env.CIRCUIT_BREAKER_ENABLE_FALLBACK) {
        console.warn(`[ExternalAPI] ${options.serviceName} circuit breaker open, queueing fallback`);
        await fallbackQueueService.enqueueFallback(
          {
            serviceName: options.serviceName,
            operationName: options.operationName,
            requestData: { operation: options.operationName },
            error: err,
            metadata: options.metadata,
          },
          5,
        );
        throw err;
      }

      throw err;
    }
  }
}

const externalAPIClient = new ExternalAPIClient();

export async function callExternalAPI<T>(
  fn: () => Promise<T>,
  options: ExternalAPICallOptions<T>,
): Promise<T> {
  return externalAPIClient.executeWithCircuitBreaker(fn, options);
}

export async function fetchExternalAPI<T>(
  url: string,
  init?: RequestInit & { timeout?: number },
  options?: Omit<ExternalAPICallOptions<T>, 'operationName'>,
): Promise<T> {
  const operationName = `${init?.method || 'GET'} ${new URL(url).pathname}`;

  return callExternalAPI(
    () =>
      Promise.race([
        fetch(url, init).then((res) => {
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
          }
          return res.json() as Promise<T>;
        }),
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error('Fetch timeout')), init?.timeout || 5000),
        ),
      ]),
    {
      ...options,
      operationName,
      serviceName: options?.serviceName || new URL(url).hostname,
    },
  );
}

export interface CircuitBreakerStats {
  serviceName: string;
  operationName: string;
  state: string;
  requestCount: number;
  successCount: number;
  failureCount: number;
  successRate: number;
}

export function getAllCircuitBreakerStats(): CircuitBreakerStats[] {
  if (!isCircuitBreakerEnabled()) {
    return [];
  }

  const { getAllCircuitBreakers } = require('./circuit-breaker');
  const stats: CircuitBreakerStats[] = [];

  for (const [name, breaker] of getAllCircuitBreakers()) {
    const metrics = breaker.getMetrics();
    const [serviceName, operationName] = name.split(':');

    stats.push({
      serviceName,
      operationName,
      state: metrics.state,
      requestCount: metrics.requestCount,
      successCount: metrics.successCount,
      failureCount: metrics.failureCount,
      successRate: metrics.successRate,
    });
  }

  return stats;
}
