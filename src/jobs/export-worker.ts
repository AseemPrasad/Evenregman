import "server-only";

import { connectToDatabase } from "@/lib/db";
import { ExportJobModel } from "@/models/ExportJob";
import { RegistrationModel } from "@/models/Registration";
import { toObjectId } from "@/lib/ownership";
import { dequeueJob } from "@/lib/queue";
import { generatePresignedUrl } from "@/lib/s3";
import { JOB_TYPES, JOB_CONFIG } from "@/lib/job-queue-config";
import { getRedisInstance } from "@/lib/queue";
import { env } from "@/lib/env";

interface JobContext {
  jobId: string;
  eventId: string;
  hostId: string;
  mode?: string;
  search?: string;
}

async function fetchJobData(jobId: string): Promise<JobContext | null> {
  const redis = getRedisInstance();
  if (!redis) return null;

  try {
    const jobKey = `job:${jobId}`;
    const data = await redis.hget(jobKey, "data");
    if (!data) return null;

    const parsed = JSON.parse(data);
    return {
      jobId: parsed.jobId,
      eventId: parsed.eventId,
      hostId: parsed.hostId,
      mode: parsed.mode,
      search: parsed.search
    };
  } catch (err) {
    console.error("[Worker] Failed to fetch job data:", err);
    return null;
  }
}

async function updateJobStatus(
  jobId: string,
  status: string,
  data?: Record<string, any>
): Promise<void> {
  const redis = getRedisInstance();
  if (!redis) return;

  try {
    const jobKey = `job:${jobId}`;
    const updates: Record<string, any> = { status };

    if (data) {
      Object.assign(updates, data);
    }

    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined && value !== null) {
        await redis.hset(jobKey, key, value.toString());
      }
    }
  } catch (err) {
    console.error("[Worker] Failed to update job status:", err);
  }
}

async function processExportJob(context: JobContext): Promise<void> {
  const jobId = context.jobId;
  const eventId = context.eventId;
  const mode = context.mode || "name_email";
  const search = context.search;

  console.log(`[Worker] Processing export job ${jobId} for event ${eventId}`);

  try {
    await connectToDatabase();

    const job = await ExportJobModel.findOne({ jobId });
    if (!job) {
      throw new Error("Job record not found in database");
    }

    await updateJobStatus(jobId, "processing", { startedAt: Date.now() });
    await ExportJobModel.updateOne(
      { jobId },
      { status: "processing", startedAt: new Date() }
    );

    let totalRows = 0;
    const pipeline: any[] = [
      { $match: { eventId: toObjectId(eventId), status: { $in: ["ACTIVE"] } } },
      { $lookup: { from: "users", localField: "attendeeId", foreignField: "_id", as: "attendee" } },
      { $unwind: "$attendee" }
    ];

    if (search) {
      const regex = new RegExp(search.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&"), "i");
      pipeline.push({
        $match: {
          $or: [
            { "attendee.name": { $regex: regex } },
            { "attendee.email": { $regex: regex } }
          ]
        }
      });
    }

    pipeline.push({ $project: { "attendee.name": 1, "attendee.email": 1 } });

    const cursor = RegistrationModel.aggregate(pipeline).cursor({ batchSize: 500 });

    const s3Key = `exports/${eventId}/${jobId}.csv`;
    let csvContent = "";

    if (mode === "email" || mode === "email_only") {
      csvContent = "email\n";
    } else {
      csvContent = "name,email\n";
    }

    for await (const doc of cursor) {
      const attendee = doc.attendee || {};
      const name = (attendee.name || "").replace(/\"/g, '""');
      const email = (attendee.email || "").replace(/\"/g, '""');

      if (mode === "email" || mode === "email_only") {
        csvContent += `${email}\n`;
      } else {
        csvContent += `"${name}","${email}"\n`;
      }

      totalRows++;

      if (totalRows % 500 === 0) {
        console.log(`[Worker] ${jobId}: processed ${totalRows} rows`);
        await updateJobStatus(jobId, "processing", { rowCount: totalRows });
      }
    }

    console.log(`[Worker] ${jobId}: finished processing ${totalRows} rows`);

    const presignedUrlResult = await generatePresignedUrl(s3Key, 900);
    const expiresAt = new Date(Date.now() + 900 * 1000);

    await updateJobStatus(jobId, "completed", {
      downloadUrl: presignedUrlResult.url,
      rowCount: totalRows,
      completedAt: Date.now(),
      expiresAt: expiresAt.getTime()
    });

    await ExportJobModel.updateOne(
      { jobId },
      {
        status: "completed",
        downloadUrl: presignedUrlResult.url,
        s3Key,
        rowCount: totalRows,
        completedAt: new Date(),
        expiresAt
      }
    );

    console.log(`[Worker] ${jobId}: export completed successfully`);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error(`[Worker] ${jobId}: export failed:`, errorMessage);

    await updateJobStatus(jobId, "failed", {
      errorMessage,
      completedAt: Date.now()
    });

    await ExportJobModel.updateOne(
      { jobId },
      {
        status: "failed",
        errorMessage,
        completedAt: new Date()
      }
    );
  }
}

export async function runExportWorker(): Promise<void> {
  if (env.ASYNC_EXPORTS_WORKER_ENABLED !== "true") {
    console.log("[Worker] Export worker disabled via feature flag");
    return;
  }

  if (env.ENABLE_ASYNC_EXPORTS !== "true") {
    console.log("[Worker] Async exports disabled, worker exiting");
    return;
  }

  console.log("[Worker] Export worker starting");

  const pollInterval = 2000;
  let isProcessing = false;

  const processQueue = async () => {
    if (isProcessing) return;

    try {
      isProcessing = true;

      const jobId = await dequeueJob(JOB_TYPES.EXPORT_REGISTRATIONS);
      if (!jobId) {
        isProcessing = false;
        return;
      }

      const jobContext = await fetchJobData(jobId);
      if (!jobContext) {
        console.warn(`[Worker] Could not fetch data for job ${jobId}`);
        isProcessing = false;
        return;
      }

      await processExportJob(jobContext);
    } catch (err) {
      console.error("[Worker] Unexpected error in process queue:", err);
    } finally {
      isProcessing = false;
    }
  };

  const pollLoop = setInterval(processQueue, pollInterval);

  process.on("SIGTERM", () => {
    console.log("[Worker] SIGTERM received, shutting down gracefully");
    clearInterval(pollLoop);
    process.exit(0);
  });

  process.on("SIGINT", () => {
    console.log("[Worker] SIGINT received, shutting down gracefully");
    clearInterval(pollLoop);
    process.exit(0);
  });

  console.log("[Worker] Export worker ready, polling for jobs");
}
