import "server-only";

import Redis from "ioredis";
import { env } from "@/lib/env";
import { JOB_TYPES, type JobType } from "@/lib/job-queue-config";

let redisInstance: Redis | null = null;
let queueInitialized = false;

export interface ExportJobData {
  eventId: string;
  hostId: string;
  mode?: string;
  search?: string;
}

export interface EnqueuedJob {
  jobId: string;
  status: "pending";
  createdAt: Date;
}

export function getRedisInstance(): Redis | null {
  if (env.ENABLE_ASYNC_EXPORTS !== "true") {
    return null;
  }

  if (!redisInstance && env.REDIS_URL) {
    try {
      redisInstance = new Redis(env.REDIS_URL, {
        retryStrategy: (times) => Math.min(times * 50, 2000),
        maxRetriesPerRequest: 3
      });
      redisInstance.on("error", (err) => {
        console.error("[Queue] Redis connection error:", err);
      });
    } catch (err) {
      console.error("[Queue] Failed to initialize Redis:", err);
    }
  }

  return redisInstance;
}

export async function initializeQueue(): Promise<void> {
  if (env.ENABLE_ASYNC_EXPORTS !== "true") {
    queueInitialized = true;
    return;
  }

  const redis = getRedisInstance();
  if (!redis) {
    console.warn("[Queue] Redis not available, async exports disabled");
    queueInitialized = true;
    return;
  }

  try {
    await redis.ping();
    console.log("[Queue] Redis connection established");
    queueInitialized = true;
  } catch (err) {
    console.error("[Queue] Failed to connect to Redis:", err);
    queueInitialized = false;
  }
}

export async function enqueueExportJob(
  jobType: JobType,
  data: ExportJobData
): Promise<EnqueuedJob | null> {
  if (env.ENABLE_ASYNC_EXPORTS !== "true") {
    return null;
  }

  const redis = getRedisInstance();
  if (!redis) {
    console.warn("[Queue] Redis not available, cannot enqueue job");
    return null;
  }

  try {
    const jobId = `export-${data.eventId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const jobKey = `job:${jobId}`;
    const queueKey = `queue:${jobType}`;

    const jobData = {
      jobId,
      jobType,
      ...data,
      createdAt: new Date().toISOString()
    };

    await redis.pipeline()
      .hset(jobKey, "data", JSON.stringify(jobData))
      .hset(jobKey, "status", "pending")
      .hset(jobKey, "createdAt", Date.now().toString())
      .expire(jobKey, 86400)
      .lpush(queueKey, jobId)
      .exec();

    console.log(`[Queue] Enqueued job ${jobId} for ${jobType}`);

    return {
      jobId,
      status: "pending",
      createdAt: new Date()
    };
  } catch (err) {
    console.error("[Queue] Failed to enqueue job:", err);
    return null;
  }
}

export async function getQueuedJobs(jobType: JobType): Promise<string[]> {
  const redis = getRedisInstance();
  if (!redis) return [];

  try {
    const queueKey = `queue:${jobType}`;
    const jobs = await redis.lrange(queueKey, 0, -1);
    return jobs || [];
  } catch (err) {
    console.error("[Queue] Failed to get queued jobs:", err);
    return [];
  }
}

export async function dequeueJob(jobType: JobType): Promise<string | null> {
  const redis = getRedisInstance();
  if (!redis) return null;

  try {
    const queueKey = `queue:${jobType}`;
    const jobId = await redis.rpop(queueKey);
    return jobId;
  } catch (err) {
    console.error("[Queue] Failed to dequeue job:", err);
    return null;
  }
}

export async function disconnectQueue(): Promise<void> {
  if (redisInstance) {
    await redisInstance.quit();
    redisInstance = null;
    queueInitialized = false;
    console.log("[Queue] Disconnected from Redis");
  }
}
