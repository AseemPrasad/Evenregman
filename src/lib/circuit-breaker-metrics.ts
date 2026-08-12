import { getAllCircuitBreakers, CircuitBreakerState } from './circuit-breaker';
import { fallbackQueueService } from './fallback-queue';
import { env } from './env';
import { isCircuitBreakerEnabled } from './circuit-breaker';

export interface CircuitBreakerMetric {
  name: string;
  state: CircuitBreakerState;
  requestCount: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  lastFailureTime?: number;
  lastSuccessTime?: number;
  trippedAt?: number;
}

export interface CircuitBreakerHealthReport {
  enabled: boolean;
  timestamp: Date;
  circuitBreakers: CircuitBreakerMetric[];
  fallbackQueueStats: Record<string, number>;
  totalTrippedBreakers: number;
  totalOpenBreakers: number;
  averageSuccessRate: number;
}

export async function getCircuitBreakerMetrics(): Promise<CircuitBreakerMetric[]> {
  if (!isCircuitBreakerEnabled()) {
    return [];
  }

  const metrics: CircuitBreakerMetric[] = [];

  for (const [name, breaker] of getAllCircuitBreakers()) {
    const circuitMetrics = breaker.getMetrics();

    metrics.push({
      name,
      state: circuitMetrics.state,
      requestCount: circuitMetrics.requestCount,
      successCount: circuitMetrics.successCount,
      failureCount: circuitMetrics.failureCount,
      successRate: circuitMetrics.successRate,
      lastFailureTime: circuitMetrics.lastFailureTime,
      lastSuccessTime: circuitMetrics.lastSuccessTime,
      trippedAt: circuitMetrics.trippedAt,
    });
  }

  return metrics;
}

export async function getCircuitBreakerHealthReport(): Promise<CircuitBreakerHealthReport> {
  const cbMetrics = await getCircuitBreakerMetrics();
  const fallbackStats = await fallbackQueueService.getQueueStats();

  const trippedBreakers = cbMetrics.filter((m) => m.trippedAt !== undefined).length;
  const openBreakers = cbMetrics.filter((m) => m.state === 'OPEN').length;

  const averageSuccessRate = cbMetrics.length > 0
    ? cbMetrics.reduce((sum, m) => sum + m.successRate, 0) / cbMetrics.length
    : 100;

  return {
    enabled: isCircuitBreakerEnabled(),
    timestamp: new Date(),
    circuitBreakers: cbMetrics,
    fallbackQueueStats: fallbackStats,
    totalTrippedBreakers: trippedBreakers,
    totalOpenBreakers: openBreakers,
    averageSuccessRate,
  };
}

export async function getCircuitBreakerState(name: string): Promise<CircuitBreakerMetric | undefined> {
  const metrics = await getCircuitBreakerMetrics();
  return metrics.find((m) => m.name === name);
}

export async function recordCircuitBreakerEvent(
  name: string,
  eventType: 'TRIP' | 'RECOVER' | 'RESET' | 'PROBE_SUCCESS' | 'PROBE_FAILURE',
  details?: Record<string, any>,
): Promise<void> {
  if (!isCircuitBreakerEnabled()) {
    return;
  }

  const timestamp = new Date().toISOString();
  const message = `[CircuitBreakerEvent] ${name}: ${eventType} at ${timestamp}`;

  if (details) {
    console.info(message, details);
  } else {
    console.info(message);
  }
}

export function isCircuitBreakerTripped(name: string): boolean {
  if (!isCircuitBreakerEnabled()) {
    return false;
  }

  const { getCircuitBreaker } = require('./circuit-breaker');
  const breaker = getCircuitBreaker(name);

  if (!breaker) {
    return false;
  }

  return breaker.getState() === 'OPEN';
}

export async function resetCircuitBreakerMetrics(name?: string): Promise<void> {
  if (!isCircuitBreakerEnabled()) {
    return;
  }

  const { resetCircuitBreaker, getAllCircuitBreakers } = require('./circuit-breaker');

  if (name) {
    resetCircuitBreaker(name);
    console.info(`[CircuitBreakerMetrics] Reset metrics for ${name}`);
  } else {
    for (const [breakerName] of getAllCircuitBreakers()) {
      resetCircuitBreaker(breakerName);
    }
    console.info('[CircuitBreakerMetrics] Reset all circuit breaker metrics');
  }
}

export async function cleanupFallbackQueue(): Promise<number> {
  if (!isCircuitBreakerEnabled()) {
    return 0;
  }

  try {
    const deleted = await fallbackQueueService.cleanupExpired();
    console.info(`[CircuitBreakerMetrics] Cleaned up ${deleted} expired fallback queue items`);
    return deleted;
  } catch (err) {
    console.error('[CircuitBreakerMetrics] Cleanup error:', err);
    return 0;
  }
}

export async function checkHealthAlerts(): Promise<string[]> {
  const alerts: string[] = [];
  const report = await getCircuitBreakerHealthReport();

  if (report.totalOpenBreakers > 0) {
    alerts.push(`ALERT: ${report.totalOpenBreakers} circuit breaker(s) OPEN`);
  }

  if (report.fallbackQueueStats.pending > 100) {
    alerts.push(`ALERT: Fallback queue has ${report.fallbackQueueStats.pending} pending items`);
  }

  if (report.averageSuccessRate < 50) {
    alerts.push(`ALERT: Average success rate is ${report.averageSuccessRate.toFixed(2)}% (< 50%)`);
  }

  for (const cb of report.circuitBreakers) {
    if (cb.state === 'OPEN' && cb.trippedAt) {
      const trippedSeconds = (Date.now() - cb.trippedAt) / 1000;
      if (trippedSeconds > 300) {
        alerts.push(`WARNING: ${cb.name} open for ${trippedSeconds.toFixed(0)}s`);
      }
    }
  }

  return alerts;
}
