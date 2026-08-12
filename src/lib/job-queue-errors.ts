import "server-only";

export class JobQueueError extends Error {
  constructor(
    message: string,
    public jobId?: string,
    public context?: Record<string, any>
  ) {
    super(message);
    this.name = "JobQueueError";
  }
}

export class ExportJobError extends JobQueueError {
  constructor(
    message: string,
    public eventId?: string,
    public hostId?: string,
    jobId?: string,
    context?: Record<string, any>
  ) {
    super(message, jobId, context);
    this.name = "ExportJobError";
  }
}

export class S3UploadError extends JobQueueError {
  constructor(
    message: string,
    public s3Key?: string,
    jobId?: string,
    context?: Record<string, any>
  ) {
    super(message, jobId, context);
    this.name = "S3UploadError";
  }
}

export class DatabaseCursorError extends ExportJobError {
  constructor(
    message: string,
    eventId?: string,
    jobId?: string,
    context?: Record<string, any>
  ) {
    super(message, eventId, undefined, jobId, context);
    this.name = "DatabaseCursorError";
  }
}

export class PreSignedUrlError extends JobQueueError {
  constructor(
    message: string,
    public s3Key?: string,
    jobId?: string,
    context?: Record<string, any>
  ) {
    super(message, jobId, context);
    this.name = "PreSignedUrlError";
  }
}

export function isJobQueueError(err: unknown): err is JobQueueError {
  return err instanceof JobQueueError;
}

export function isExportJobError(err: unknown): err is ExportJobError {
  return err instanceof ExportJobError;
}

export function isS3UploadError(err: unknown): err is S3UploadError {
  return err instanceof S3UploadError;
}

export function isDatabaseCursorError(err: unknown): err is DatabaseCursorError {
  return err instanceof DatabaseCursorError;
}

export function isPreSignedUrlError(err: unknown): err is PreSignedUrlError {
  return err instanceof PreSignedUrlError;
}

export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return "Unknown error";
}

export function getErrorContext(err: unknown): Record<string, any> {
  if (isJobQueueError(err)) {
    return {
      jobId: err.jobId,
      ...(err.context || {})
    };
  }
  if (isExportJobError(err)) {
    return {
      eventId: err.eventId,
      hostId: err.hostId,
      jobId: err.jobId,
      ...(err.context || {})
    };
  }
  if (isS3UploadError(err)) {
    return {
      s3Key: err.s3Key,
      jobId: err.jobId,
      ...(err.context || {})
    };
  }
  return {};
}
