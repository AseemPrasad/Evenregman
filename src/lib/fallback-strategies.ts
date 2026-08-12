import { env } from './env';

export interface FallbackContext {
  serviceName: string;
  operationName: string;
  requestData: any;
  error: Error;
  metadata?: Record<string, any>;
}

export interface FallbackStrategy<T> {
  name: string;
  execute(context: FallbackContext): Promise<T> | T;
}

export class RejectionFallback<T> implements FallbackStrategy<T> {
  name = 'rejection';

  execute(context: FallbackContext): Promise<T> {
    return Promise.reject(new Error(`[Fallback:${context.serviceName}] All fallback strategies exhausted: ${context.error.message}`));
  }
}

export class DefaultValueFallback<T> implements FallbackStrategy<T> {
  name = 'default-value';

  constructor(private defaultValue: T) {}

  execute(_context: FallbackContext): T {
    return this.defaultValue;
  }
}

export class CachedResponseFallback<T> implements FallbackStrategy<T> {
  name = 'cached-response';
  private cache = new Map<string, { value: T; timestamp: number }>();
  private readonly ttlMs: number;

  constructor(ttlMs: number = 3600000) {
    this.ttlMs = ttlMs;
  }

  setCachedValue(key: string, value: T): void {
    this.cache.set(key, { value, timestamp: Date.now() });
  }

  execute(context: FallbackContext): T | Promise<never> {
    const cacheKey = `${context.serviceName}:${context.operationName}`;
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.ttlMs) {
      return cached.value;
    }

    return Promise.reject(new Error(`[Fallback:${context.serviceName}] No valid cached response available`));
  }
}

export class QueueFallback<T> implements FallbackStrategy<T> {
  name = 'queue';

  constructor(private queueFn: (context: FallbackContext) => Promise<void>) {}

  async execute(context: FallbackContext): Promise<T> {
    await this.queueFn(context);
    return {} as T;
  }
}

export class ComposedFallback<T> implements FallbackStrategy<T> {
  name = 'composed';

  constructor(private strategies: FallbackStrategy<T>[]) {}

  async execute(context: FallbackContext): Promise<T> {
    const errors: Error[] = [];

    for (const strategy of this.strategies) {
      try {
        const result = await strategy.execute(context);
        console.info(
          `[Fallback:${context.serviceName}] Strategy '${strategy.name}' succeeded`,
        );
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        errors.push(error);
        console.warn(
          `[Fallback:${context.serviceName}] Strategy '${strategy.name}' failed: ${error.message}`,
        );
      }
    }

    const allErrors = errors.map((e) => e.message).join('; ');
    throw new Error(
      `[Fallback:${context.serviceName}] All ${this.strategies.length} strategies failed: ${allErrors}`,
    );
  }
}

export function createFallbackChain<T>(...strategies: FallbackStrategy<T>[]): ComposedFallback<T> {
  return new ComposedFallback(strategies);
}

export async function executeFallback<T>(
  strategy: FallbackStrategy<T> | undefined,
  context: FallbackContext,
): Promise<T | undefined> {
  if (!strategy) {
    return undefined;
  }

  try {
    return await strategy.execute(context);
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error(`[Fallback:${context.serviceName}] Fallback execution failed:`, error);
    return undefined;
  }
}
