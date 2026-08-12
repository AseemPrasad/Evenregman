import "server-only";

export const JOB_TYPES = {
  EXPORT_REGISTRATIONS: "export:registrations"
} as const;

export type JobType = (typeof JOB_TYPES)[keyof typeof JOB_TYPES];

export const JOB_STATUSES = {
  PENDING: "pending",
  PROCESSING: "processing",
  COMPLETED: "completed",
  FAILED: "failed"
} as const;

export type JobStatus = (typeof JOB_STATUSES)[keyof typeof JOB_STATUSES];

export interface ExportJobConfig {
  jobType: JobType;
  timeout: number;
  maxRetries: number;
  retryDelay: number;
  batchSize: number;
}

export const JOB_CONFIG: Record<JobType, ExportJobConfig> = {
  [JOB_TYPES.EXPORT_REGISTRATIONS]: {
    jobType: JOB_TYPES.EXPORT_REGISTRATIONS,
    timeout: 300000,
    maxRetries: 2,
    retryDelay: 5000,
    batchSize: 500
  }
};

export interface QueueConfig {
  redisUrl: string;
  defaultWorkerConcurrency: number;
  maxQueueSize: number;
  pollInterval: number;
}

export const DEFAULT_QUEUE_CONFIG: QueueConfig = {
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
  defaultWorkerConcurrency: 2,
  maxQueueSize: 1000,
  pollInterval: 5000
};
