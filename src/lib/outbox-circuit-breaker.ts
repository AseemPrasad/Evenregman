import { createCircuitBreaker, isCircuitBreakerEnabled, CircuitBreakerOpenError } from './circuit-breaker';
import { createCircuitBreakerConfig } from './circuit-breaker-config';
import { fallbackQueueService } from './fallback-queue';
import { OutboxEvent } from '@/models/OutboxEvent';
import { env } from './env';

export interface OutboxCircuitBreakerOptions {
  eventType: string;
  handler: (event: OutboxEvent) => Promise<void>;
  preset?: 'conservative' | 'normal' | 'aggressive';
}

class OutboxCircuitBreakerRegistry {
  private handlers = new Map<string, any>();
  private circuitBreakers = new Map<string, any>();

  registerHandler(options: OutboxCircuitBreakerOptions): void {
    this.handlers.set(options.eventType, options);
  }

  async handleEventWithCircuitBreaker(event: OutboxEvent): Promise<void> {
    const handlerOptions = this.handlers.get(event.eventType);

    if (!handlerOptions) {
      throw new Error(`[OutboxCircuitBreaker] No handler registered for event type: ${event.eventType}`);
    }

    if (!isCircuitBreakerEnabled()) {
      return handlerOptions.handler(event);
    }

    const circuitBreakerKey = `outbox:${event.eventType}`;

    if (!this.circuitBreakers.has(circuitBreakerKey)) {
      const config = createCircuitBreakerConfig(circuitBreakerKey, handlerOptions.preset || 'normal');
      const breaker = createCircuitBreaker(
        circuitBreakerKey,
        () => handlerOptions.handler(event),
        config,
      );
      this.circuitBreakers.set(circuitBreakerKey, breaker);
    }

    const breaker = this.circuitBreakers.get(circuitBreakerKey);

    try {
      return await breaker.execute();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      if (error instanceof CircuitBreakerOpenError && env.CIRCUIT_BREAKER_ENABLE_FALLBACK) {
        console.warn(`[OutboxCircuitBreaker] Event type '${event.eventType}' circuit breaker open, queueing fallback`);

        await fallbackQueueService.enqueueFallback(
          {
            serviceName: `outbox:${event.eventType}`,
            operationName: 'handleOutboxEvent',
            requestData: {
              eventId: event._id,
              eventType: event.eventType,
              payload: event.payload,
            },
            error: err,
            metadata: {
              retryCount: event.retryCount,
            },
          },
          5,
        );
      }

      throw error;
    }
  }

  getCircuitBreakerStats(): Map<string, any> {
    return this.circuitBreakers;
  }
}

export const outboxCircuitBreakerRegistry = new OutboxCircuitBreakerRegistry();

export async function processOutboxEventWithFallbackRetry(
  eventHandlerRegistry: any,
  events: OutboxEvent[],
): Promise<void> {
  if (!isCircuitBreakerEnabled()) {
    return;
  }

  console.log(`[OutboxCircuitBreaker] Processing ${events.length} fallback events`);

  for (const event of events) {
    try {
      await outboxCircuitBreakerRegistry.handleEventWithCircuitBreaker(event);
    } catch (err) {
      console.error(`[OutboxCircuitBreaker] Failed to process event ${event._id}:`, err);
    }
  }
}
