import "server-only";

export class RateLimitError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly headers: Record<string, string>,
    public readonly policy: string,
    public readonly identifier: string,
    public readonly retry_after?: number
  ) {
    super(message);
    this.name = "RateLimitError";
  }
}

export class RateLimitConfigError extends Error {
  constructor(message: string, public readonly policy: string) {
    super(message);
    this.name = "RateLimitConfigError";
  }
}

export function isRateLimitError(error: unknown): error is RateLimitError {
  return error instanceof RateLimitError;
}

export function isRateLimitConfigError(error: unknown): error is RateLimitConfigError {
  return error instanceof RateLimitConfigError;
}
