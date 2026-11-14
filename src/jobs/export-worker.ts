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

  try {
    console.log(`[Worker] ${jobId}: starting export for event ${eventId}`);

    await connectToDatabase();

    await updateJobStatus(jobId, "processing", {
      startedAt: Date.now()
    });

    await ExportJobModel.updateOne(
      { jobId },
      {
        status: "processing",
        startedAt: new Date()
      }
    );

    const matchStage: any = {
      eventId: toObjectId(eventId),
      status: "ACTIVE"
    };

    const pipeline: any[] = [
      { $match: matchStage },
      {
        $lookup: {
          from: "users",
          localField: "attendeeId",
          foreignField: "_id",
          as: "attendee"
        }
      },
      { $unwind: "$attendee" }
    ];

    if (search && search.trim()) {
      const regex = new RegExp(
        search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        "i"
      );
      pipeline.push({
        $match: {
          $or: [
            { "attendee.name": { $regex: regex } },
            { "attendee.email": { $regex: regex } }
          ]
        }
      });
    }

    pipeline.push({
      $project: {
        _id: 1,
        registeredAt: 1,
        "attendee.name": 1,
        "attendee.email": 1
      }
    });

    let rowCount = 0;
    const rows: string[] = [];

    const headers =
      mode === "detailed"
        ? ["Registration ID", "Name", "Email", "Registered At"]
        : ["Name", "Email"];

    rows.push(headers.map((h) => `"${h}"`).join(","));

    const cursor = RegistrationModel.aggregate(pipeline).cursor({ batchSize: 500 });

    for await (const doc of cursor) {
      rowCount++;

      const registeredAt = doc.registeredAt
        ? new Date(doc.registeredAt).toISOString()
        : "";

      const row =
        mode === "detailed"
          ? [
              doc._id.toString(),
              doc.attendee.name,
              doc.attendee.email,
              registeredAt
            ]
          : [doc.attendee.name, doc.attendee.email];

      rows.push(
        row
          .map((val) => `"${String(val).replace(/"/g, '""')}"`)
          .join(",")
      );
    }

    const csvContent = rows.join("\n");
    const s3Key = `exports/${eventId}/${jobId}.csv`;

    console.log(`[Worker] ${jobId}: generated ${rowCount} rows, presigning URL`);

    const presignedUrlResult = await generatePresignedUrl(s3Key, 900);

    await updateJobStatus(jobId, "completed", {
      downloadUrl: presignedUrlResult.url,
      s3Key,
      rowCount,
      completedAt: Date.now(),
      expiresAt: presignedUrlResult.expiresAt.getTime()
    });

    await ExportJobModel.updateOne(
      { jobId },
      {
        status: "completed",
        downloadUrl: presignedUrlResult.url,
        s3Key,
        rowCount,
        completedAt: new Date(),
        expiresAt: presignedUrlResult.expiresAt
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
        console.warn(`[Worker] Could not fetch data for job ${jobId}, marking as failed`);
        await updateJobStatus(jobId, "failed", {
          errorMessage: "Corrupted or expired export job data",
          completedAt: Date.now()
        });
        try {
          await connectToDatabase();
          await ExportJobModel.updateOne(
            { jobId },
            {
              status: "failed",
              errorMessage: "Corrupted or expired export job data",
              completedAt: new Date()
            }
          );
        } catch (dbErr) {
          console.error(`[Worker] Failed to update failed state in DB for ${jobId}:`, dbErr);
        }
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
