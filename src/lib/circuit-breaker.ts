import { CircuitBreakerConfig } from './circuit-breaker-config';
import { env } from './env';

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerMetrics {
  state: CircuitBreakerState;
  requestCount: number;
  successCount: number;
  failureCount: number;
  lastFailureTime?: number;
  lastSuccessTime?: number;
  successRate: number;
  trippedAt?: number;
}

class InMemoryCircuitBreaker<T> {
  private state: CircuitBreakerState = 'CLOSED';
  private requestCount = 0;
  private successCount = 0;
  private failureCount = 0;
  private lastFailureTime?: number;
  private lastSuccessTime?: number;
  private trippedAt?: number;
  private resetTimer?: NodeJS.Timeout;
  private windowStartTime: number = Date.now();

  constructor(
    private name: string,
    private fn: (...args: any[]) => Promise<T>,
    private config: CircuitBreakerConfig,
  ) {}

  async execute(...args: any[]): Promise<T> {
    const now = Date.now();
    const windowAge = now - this.windowStartTime;

    // Reset rolling window
    if (windowAge > this.config.rollingWindow) {
      this.resetWindow();
    }

    // State: OPEN - fail fast
    if (this.state === 'OPEN') {
      if (now - this.trippedAt! > this.config.resetTimeout) {
        this.transitionToHalfOpen();
      } else {
        throw new CircuitBreakerOpenError(`[CircuitBreaker:${this.name}] Circuit breaker is OPEN`);
      }
    }

    // State: HALF_OPEN - single probe request
    if (this.state === 'HALF_OPEN') {
      try {
        const result = await this.executeWithTimeout(args);
        this.onSuccess();
        return result;
      } catch (error) {
        this.onFailure();
        throw error;
      }
    }

    // State: CLOSED - normal operation
    try {
      const result = await this.executeWithTimeout(args);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      this.evaluateThreshold();
      throw error;
    }
  }

  private async executeWithTimeout(args: any[]): Promise<T> {
    return Promise.race([
      this.fn(...args),
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new CircuitBreakerTimeoutError(`Request timeout after ${this.config.timeout}ms`)), this.config.timeout),
      ),
    ]);
  }

  private onSuccess(): void {
    this.successCount++;
    this.requestCount++;
    this.lastSuccessTime = Date.now();
  }

  private onFailure(): void {
    this.failureCount++;
    this.requestCount++;
    this.lastFailureTime = Date.now();
  }

  private evaluateThreshold(): void {
    if (this.requestCount < this.config.volumeThreshold) {
      return;
    }

    const errorRate = (this.failureCount / this.requestCount) * 100;

    if (errorRate >= this.config.errorThresholdPercentage) {
      this.tripBreaker();
    }
  }

  private tripBreaker(): void {
    if (this.state !== 'OPEN') {
      this.state = 'OPEN';
      this.trippedAt = Date.now();
      console.warn(`[CircuitBreaker:${this.name}] TRIPPED (${this.failureCount}/${this.requestCount} failures)`);
    }
  }

  private transitionToHalfOpen(): void {
    this.state = 'HALF_OPEN';
    console.info(`[CircuitBreaker:${this.name}] Transitioning to HALF_OPEN for probe`);
  }

  private resetToClosed(): void {
    this.state = 'CLOSED';
    this.resetWindow();
    console.info(`[CircuitBreaker:${this.name}] RESET to CLOSED`);
  }

  private resetWindow(): void {
    this.requestCount = 0;
    this.successCount = 0;
    this.failureCount = 0;
    this.windowStartTime = Date.now();
  }

  getMetrics(): CircuitBreakerMetrics {
    return {
      state: this.state,
      requestCount: this.requestCount,
      successCount: this.successCount,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      successRate: this.requestCount > 0 ? (this.successCount / this.requestCount) * 100 : 100,
      trippedAt: this.trippedAt,
    };
  }

  getState(): CircuitBreakerState {
    return this.state;
  }

  reset(): void {
    this.resetToClosed();
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
    }
  }
}

export class CircuitBreakerOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitBreakerOpenError';
  }
}

export class CircuitBreakerTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitBreakerTimeoutError';
  }
}

const circuitBreakers = new Map<string, InMemoryCircuitBreaker<any>>();

export function createCircuitBreaker<T>(
  name: string,
  fn: (...args: any[]) => Promise<T>,
  config: CircuitBreakerConfig,
): InMemoryCircuitBreaker<T> {
  if (circuitBreakers.has(name)) {
    return circuitBreakers.get(name)!;
  }

  const breaker = new InMemoryCircuitBreaker(name, fn, config);
  circuitBreakers.set(name, breaker);
  return breaker;
}

export function getCircuitBreaker(name: string): InMemoryCircuitBreaker<any> | undefined {
  return circuitBreakers.get(name);
}

export function getAllCircuitBreakers(): Map<string, InMemoryCircuitBreaker<any>> {
  return circuitBreakers;
}

export function resetCircuitBreaker(name: string): void {
  const breaker = circuitBreakers.get(name);
  if (breaker) {
    breaker.reset();
  }
}

export function isCircuitBreakerEnabled(): boolean {
  return env.ENABLE_CIRCUIT_BREAKER === true;
}
