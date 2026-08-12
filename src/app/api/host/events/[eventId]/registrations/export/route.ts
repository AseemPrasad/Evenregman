import { auth } from "@/lib/session";
import { connectToDatabase } from "@/lib/db";
import { RegistrationModel } from "@/models/Registration";
import { toObjectId, assertEventOwnership } from "@/lib/ownership";
import { env } from "@/lib/env";
import { enqueueExportJob } from "@/lib/queue";
import { ExportJobModel } from "@/models/ExportJob";
import { JOB_TYPES } from "@/lib/job-queue-config";

type RouteContext = {
  params: Promise<{
    eventId: string;
  }>;
};

async function exportSyncPath(eventId: string, mode: string, search: string | null) {
  const pipeline: any[] = [
    { $match: { eventId: toObjectId(eventId), status: { $in: ["ACTIVE"] } } },
    { $lookup: { from: "users", localField: "attendeeId", foreignField: "_id", as: "attendee" } },
    { $unwind: "$attendee" }
  ];

  if (search) {
    const regex = new RegExp(search.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&"), "i");
    pipeline.push({ $match: { $or: [{ "attendee.name": { $regex: regex } }, { "attendee.email": { $regex: regex } }] } });
  }

  pipeline.push({ $project: { "attendee.name": 1, "attendee.email": 1 } });

  const cursor = RegistrationModel.aggregate(pipeline).cursor({ batchSize: 1000 });
  const filename = `registrations-${eventId}-${mode}.csv`;

  const stream = new ReadableStream({
    async start(controller) {
      if (mode === "email" || mode === "email_only") {
        controller.enqueue(new TextEncoder().encode("email\n"));
      } else {
        controller.enqueue(new TextEncoder().encode("name,email\n"));
      }

      try {
        for await (const doc of cursor) {
          const attendee = doc.attendee || {};
          const name = (attendee.name || "").replace(/\"/g, '""');
          const email = (attendee.email || "").replace(/\"/g, '""');

          if (mode === "email" || mode === "email_only") {
            controller.enqueue(new TextEncoder().encode(`${email}\n`));
          } else {
            controller.enqueue(new TextEncoder().encode(`"${name}","${email}"\n`));
          }
        }
      } catch (err) {
        controller.error(err);
        return;
      }

      controller.close();
    }
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`
    }
  });
}

async function exportAsyncPath(eventId: string, hostId: string, mode: string, search: string | null) {
  const enqueuedJob = await enqueueExportJob(JOB_TYPES.EXPORT_REGISTRATIONS, {
    eventId,
    hostId,
    mode,
    search: search || undefined
  });

  if (!enqueuedJob) {
    return new Response(
      JSON.stringify({ error: "Failed to enqueue export job" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  await connectToDatabase();
  const exportJob = await ExportJobModel.create({
    jobId: enqueuedJob.jobId,
    eventId: toObjectId(eventId),
    hostId: toObjectId(hostId),
    status: "pending",
    rowCount: 0,
    createdAt: new Date()
  });

  return new Response(
    JSON.stringify({
      status: "accepted",
      jobId: enqueuedJob.jobId,
      statusUrl: `/api/jobs/${enqueuedJob.jobId}`
    }),
    {
      status: 202,
      headers: {
        "Content-Type": "application/json",
        "Location": `/api/jobs/${enqueuedJob.jobId}`,
        "X-Job-ID": enqueuedJob.jobId
      }
    }
  );
}

export async function GET(req: Request, { params }: RouteContext) {
  const session = await auth();

  if (!session?.user || session.user.role !== "HOST") {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  const { eventId } = await params;

  const url = new URL(req.url);
  const mode = (url.searchParams.get("mode") || "name_email").toLowerCase();
  const search = url.searchParams.get("search");

  try {
    await assertEventOwnership(eventId, session.user.id);
    await connectToDatabase();

    if (env.ENABLE_ASYNC_EXPORTS === "true") {
      return await exportAsyncPath(eventId, session.user.id, mode, search);
    } else {
      return await exportSyncPath(eventId, mode, search);
    }
  } catch (error: any) {
    const statusCode = error?.statusCode || 500;
    const message = error?.message || "Unable to export registrations.";
    return new Response(JSON.stringify({ error: message }), { status: statusCode, headers: { "Content-Type": "application/json" } });
  }
}
