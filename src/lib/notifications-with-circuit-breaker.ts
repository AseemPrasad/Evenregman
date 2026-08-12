import { createCircuitBreaker, isCircuitBreakerEnabled, CircuitBreakerOpenError } from './circuit-breaker';
import { createCircuitBreakerConfig } from './circuit-breaker-config';
import { QueueFallback, createFallbackChain, DefaultValueFallback } from './fallback-strategies';
import { fallbackQueueService } from './fallback-queue';
import { env } from './env';

export interface EmailNotification {
  to: string;
  subject: string;
  body: string;
  html?: string;
  metadata?: Record<string, any>;
}

export interface SMSNotification {
  to: string;
  message: string;
  metadata?: Record<string, any>;
}

export interface WebhookNotification {
  url: string;
  method?: string;
  payload: any;
  metadata?: Record<string, any>;
}

class NotificationService {
  private emailCircuitBreaker: any;
  private smsCircuitBreaker: any;
  private webhookCircuitBreaker: any;

  constructor(
    private emailProvider: (notification: EmailNotification) => Promise<void>,
    private smsProvider: (notification: SMSNotification) => Promise<void>,
    private webhookProvider: (notification: WebhookNotification) => Promise<void>,
  ) {
    if (isCircuitBreakerEnabled()) {
      this.initializeCircuitBreakers();
    }
  }

  private initializeCircuitBreakers(): void {
    const emailConfig = createCircuitBreakerConfig('email-notification', 'normal');
    this.emailCircuitBreaker = createCircuitBreaker('email-notification', this.emailProvider, emailConfig);

    const smsConfig = createCircuitBreakerConfig('sms-notification', 'normal');
    this.smsCircuitBreaker = createCircuitBreaker('sms-notification', this.smsProvider, smsConfig);

    const webhookConfig = createCircuitBreakerConfig('webhook-notification', 'aggressive');
    this.webhookCircuitBreaker = createCircuitBreaker('webhook-notification', this.webhookProvider, webhookConfig);
  }

  async sendEmail(notification: EmailNotification): Promise<void> {
    if (!isCircuitBreakerEnabled()) {
      return this.emailProvider(notification);
    }

    try {
      return await this.emailCircuitBreaker.execute(notification);
    } catch (error) {
      if (error instanceof CircuitBreakerOpenError || env.CIRCUIT_BREAKER_ENABLE_FALLBACK) {
        console.warn('[Notifications] Email circuit breaker open or error, queueing fallback:', error);
        await fallbackQueueService.enqueueFallback(
          {
            serviceName: 'email-notification',
            operationName: 'sendEmail',
            requestData: notification,
            error: error instanceof Error ? error : new Error(String(error)),
            metadata: notification.metadata,
          },
          5,
        );
        return;
      }
      throw error;
    }
  }

  async sendSMS(notification: SMSNotification): Promise<void> {
    if (!isCircuitBreakerEnabled()) {
      return this.smsProvider(notification);
    }

    try {
      return await this.smsCircuitBreaker.execute(notification);
    } catch (error) {
      if (error instanceof CircuitBreakerOpenError || env.CIRCUIT_BREAKER_ENABLE_FALLBACK) {
        console.warn('[Notifications] SMS circuit breaker open or error, queueing fallback:', error);
        await fallbackQueueService.enqueueFallback(
          {
            serviceName: 'sms-notification',
            operationName: 'sendSMS',
            requestData: notification,
            error: error instanceof Error ? error : new Error(String(error)),
            metadata: notification.metadata,
          },
          5,
        );
        return;
      }
      throw error;
    }
  }

  async sendWebhook(notification: WebhookNotification): Promise<void> {
    if (!isCircuitBreakerEnabled()) {
      return this.webhookProvider(notification);
    }

    try {
      return await this.webhookCircuitBreaker.execute(notification);
    } catch (error) {
      if (error instanceof CircuitBreakerOpenError || env.CIRCUIT_BREAKER_ENABLE_FALLBACK) {
        console.warn('[Notifications] Webhook circuit breaker open or error, queueing fallback:', error);
        await fallbackQueueService.enqueueFallback(
          {
            serviceName: 'webhook-notification',
            operationName: 'sendWebhook',
            requestData: notification,
            error: error instanceof Error ? error : new Error(String(error)),
            metadata: notification.metadata,
          },
          5,
        );
        return;
      }
      throw error;
    }
  }

  async retryFallbackNotifications(): Promise<void> {
    const fallbackItems = await fallbackQueueService.dequeueFallbacks(undefined, 100);

    for (const item of fallbackItems) {
      await fallbackQueueService.markAsProcessing(item._id!);

      try {
        if (item.operationName === 'sendEmail') {
          await this.emailProvider(item.requestData as EmailNotification);
        } else if (item.operationName === 'sendSMS') {
          await this.smsProvider(item.requestData as SMSNotification);
        } else if (item.operationName === 'sendWebhook') {
          await this.webhookProvider(item.requestData as WebhookNotification);
        }

        await fallbackQueueService.markAsCompleted(item._id!);
        console.info(`[Notifications] Fallback item ${item._id} processed successfully`);
      } catch (err) {
        const shouldRetry = await fallbackQueueService.markAsFailed(item._id!, String(err));
        console.warn(
          `[Notifications] Fallback item ${item._id} failed, retry scheduled: ${shouldRetry}`,
        );
      }
    }
  }
}

export function createNotificationService(
  emailProvider: (notification: EmailNotification) => Promise<void>,
  smsProvider: (notification: SMSNotification) => Promise<void>,
  webhookProvider: (notification: WebhookNotification) => Promise<void>,
): NotificationService {
  return new NotificationService(emailProvider, smsProvider, webhookProvider);
}
