import "server-only";

export class OutboxPublisherError extends Error {
  constructor(
    message: string,
    public readonly eventType: string,
    public readonly aggregateType: string,
    public readonly aggregateId: string
  ) {
    super(message);
    this.name = "OutboxPublisherError";
  }
}

export class OutboxEventHandlerError extends Error {
  constructor(
    message: string,
    public readonly eventId: string,
    public readonly eventType: string,
    public readonly originalError: Error
  ) {
    super(message);
    this.name = "OutboxEventHandlerError";
  }
}

export class OutboxWorkerError extends Error {
  constructor(message: string, public readonly context: string) {
    super(message);
    this.name = "OutboxWorkerError";
  }
}

export function isOutboxPublisherError(error: unknown): error is OutboxPublisherError {
  return error instanceof OutboxPublisherError;
}

export function isOutboxEventHandlerError(error: unknown): error is OutboxEventHandlerError {
  return error instanceof OutboxEventHandlerError;
}

export function isOutboxWorkerError(error: unknown): error is OutboxWorkerError {
  return error instanceof OutboxWorkerError;
}
