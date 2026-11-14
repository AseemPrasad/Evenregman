import { createCircuitBreaker, isCircuitBreakerEnabled, CircuitBreakerOpenError, getAllCircuitBreakers } from './circuit-breaker';
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

    const breaker = this.circuitBreakers.get(circuitBreakerKey)!;

    try {
      return await breaker.execute();
    } catch (err) {
      if (err instanceof CircuitBreakerOpenError) {
        console.warn(`[ExternalAPIClient] Circuit breaker OPEN for ${circuitBreakerKey}`);

        if (options.fallbackStrategy) {
          return await executeFallback(options.fallbackStrategy, err, {
            serviceName: options.serviceName,
            operationName: options.operationName,
            metadata: options.metadata,
          });
        }
      }

      throw err;
    }
  }

  async executeWithQueueFallback<T>(
    fn: () => Promise<T>,
    options: ExternalAPICallOptions<T>,
    payload: Record<string, any>,
  ): Promise<T | { queued: true; queueId: string }> {
    try {
      return await this.executeWithCircuitBreaker(fn, options);
    } catch (err) {
      if (err instanceof CircuitBreakerOpenError) {
        console.warn(`[ExternalAPIClient] Enqueuing fallback request for ${options.serviceName}:${options.operationName}`);

        const queueId = await fallbackQueueService.enqueue({
          serviceName: options.serviceName,
          operationName: options.operationName,
          payload,
          priority: 5,
        });

        return {
          queued: true,
          queueId,
        };
      }

      throw err;
    }
  }
}

export const externalAPIClient = new ExternalAPIClient();

export function makeExternalAPICall<T>(
  serviceName: string,
  operationName: string,
  fn: () => Promise<T>,
  preset?: CircuitBreakerPreset,
): Promise<T> {
  return externalAPIClient.executeWithCircuitBreaker(fn, {
    serviceName,
    operationName,
    preset,
  });
}

export function makeQueuedExternalAPICall<T>(
  serviceName: string,
  operationName: string,
  fn: () => Promise<T>,
  payload: Record<string, any>,
  preset?: CircuitBreakerPreset,
): Promise<T | { queued: true; queueId: string }> {
  return externalAPIClient.executeWithQueueFallback(
    fn,
    {
      serviceName,
      operationName,
      preset,
    },
    payload,
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
