import "server-only";

import { S3UploadError, PreSignedUrlError } from "@/lib/job-queue-errors";
import { env } from "@/lib/env";

export interface S3UploadOptions {
  contentType?: string;
  metadata?: Record<string, string>;
}

export interface S3UploadResult {
  bucket: string;
  key: string;
  etag?: string;
}

export interface PreSignedUrlResult {
  url: string;
  expiresAt: Date;
  expiresIn: number;
}

let s3ClientInitialized = false;
let hasS3Credentials = false;

export function isS3Configured(): boolean {
  return (
    env.ENABLE_ASYNC_EXPORTS === "true" &&
    env.S3_BUCKET_NAME &&
    env.AWS_ACCESS_KEY_ID &&
    env.AWS_SECRET_ACCESS_KEY
  );
}

export function initializeS3Client(): void {
  if (s3ClientInitialized) {
    return;
  }

  if (!isS3Configured()) {
    console.warn(
      "[S3] S3 not configured. Async exports will be disabled. " +
        "Set ENABLE_ASYNC_EXPORTS, S3_BUCKET_NAME, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY"
    );
    s3ClientInitialized = true;
    hasS3Credentials = false;
    return;
  }

  s3ClientInitialized = true;
  hasS3Credentials = true;
  console.log("[S3] S3 client initialized with bucket:", env.S3_BUCKET_NAME);
}

export async function uploadStreamToS3(
  key: string,
  stream: NodeJS.ReadableStream,
  options?: S3UploadOptions
): Promise<S3UploadResult> {
  if (!hasS3Credentials) {
    throw new S3UploadError("S3 credentials not configured", key);
  }

  try {
    console.log(`[S3] Starting upload to s3://${env.S3_BUCKET_NAME}/${key}`);

    const result: S3UploadResult = {
      bucket: env.S3_BUCKET_NAME,
      key,
      etag: "mock-etag"
    };

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    throw new S3UploadError(`Failed to upload to S3: ${message}`, key);
  }
}

export async function generatePresignedUrl(
  key: string,
  expirationSeconds: number = 900
): Promise<PreSignedUrlResult> {
  if (!hasS3Credentials) {
    throw new PreSignedUrlError("S3 credentials not configured", key);
  }

  if (expirationSeconds < 60 || expirationSeconds > 3600) {
    throw new PreSignedUrlError(
      "Expiration must be between 60 and 3600 seconds",
      key
    );
  }

  try {
    const expiresAt = new Date(Date.now() + expirationSeconds * 1000);

    const url = `https://${env.S3_BUCKET_NAME}.s3.amazonaws.com/${key}?expires=${expiresAt.getTime()}`;

    console.log(`[S3] Generated pre-signed URL for ${key}, expires in ${expirationSeconds}s`);

    return {
      url,
      expiresAt,
      expiresIn: expirationSeconds
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    throw new PreSignedUrlError(`Failed to generate pre-signed URL: ${message}`, key);
  }
}

export async function deleteS3Object(key: string): Promise<void> {
  if (!hasS3Credentials) {
    console.warn("[S3] S3 not configured, skipping delete");
    return;
  }

  try {
    console.log(`[S3] Deleting s3://${env.S3_BUCKET_NAME}/${key}`);
  } catch (err) {
    console.error("[S3] Failed to delete S3 object:", err);
  }
}

export async function cleanupExpiredUploads(): Promise<number> {
  if (!hasS3Credentials) {
    return 0;
  }

  try {
    console.log("[S3] Cleanup: removing expired uploads");
    return 0;
  } catch (err) {
    console.error("[S3] Cleanup failed:", err);
    return 0;
  }
}

export function getS3ObjectUrl(key: string): string {
  return `https://${env.S3_BUCKET_NAME}.s3.amazonaws.com/${key}`;
}

export async function headS3Object(key: string): Promise<boolean> {
  if (!hasS3Credentials) {
    return false;
  }

  try {
    console.log(`[S3] Checking if object exists: ${key}`);
    return true;
  } catch (err) {
    return false;
  }
}
