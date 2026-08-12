import "server-only";

export class RedisTimeoutError extends Error {
  constructor(message = "Redis operation timed out") {
    super(message);
    this.name = "RedisTimeoutError";
  }
}

export class RedisUnavailableError extends Error {
  constructor(message = "Redis is unavailable") {
    super(message);
    this.name = "RedisUnavailableError";
  }
}

export class RedisCompensationFailedError extends Error {
  eventId: string;
  originalError: Error;

  constructor(eventId: string, originalError: Error, message?: string) {
    super(message ?? `Failed to compensate Redis for event ${eventId}: ${originalError.message}`);
    this.name = "RedisCompensationFailedError";
    this.eventId = eventId;
    this.originalError = originalError;
  }
}

export function isRedisTimeoutError(error: unknown): error is RedisTimeoutError {
  return error instanceof RedisTimeoutError;
}

export function isRedisUnavailableError(error: unknown): error is RedisUnavailableError {
  return error instanceof RedisUnavailableError;
}

export function isRedisCompensationFailedError(error: unknown): error is RedisCompensationFailedError {
  return error instanceof RedisCompensationFailedError;
}
