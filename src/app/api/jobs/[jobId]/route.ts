import "server-only";

import { auth } from "@/lib/session";
import { connectToDatabase } from "@/lib/db";
import { ExportJobModel } from "@/models/ExportJob";

type RouteContext = {
  params: Promise<{
    jobId: string;
  }>;
};

export async function GET(req: Request, { params }: RouteContext) {
  const session = await auth();

  if (!session?.user) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  const { jobId } = await params;

  try {
    await connectToDatabase();

    const job = await ExportJobModel.findOne({ jobId });

    if (!job) {
      return new Response(
        JSON.stringify({ error: "Job not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    if (job.hostId.toString() !== session.user.id) {
      return new Response(
        JSON.stringify({ error: "Forbidden" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    const response: any = {
      jobId: job.jobId,
      status: job.status,
      rowCount: job.rowCount || 0,
      createdAt: job.createdAt
    };

    if (job.status === "processing" && job.startedAt) {
      response.startedAt = job.startedAt;
      const elapsedMs = Date.now() - job.startedAt.getTime();
      response.elapsedSeconds = Math.floor(elapsedMs / 1000);
    }

    if (job.status === "completed") {
      response.downloadUrl = job.downloadUrl;
      response.completedAt = job.completedAt;
      if (job.expiresAt) {
        response.expiresAt = job.expiresAt;
        const nowMs = Date.now();
        const expiresMs = job.expiresAt.getTime();
        response.expiresInSeconds = Math.max(0, Math.floor((expiresMs - nowMs) / 1000));
      }
    }

    if (job.status === "failed") {
      response.errorMessage = job.errorMessage || "Export failed";
      response.failedAt = job.completedAt;
    }

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error: any) {
    const message = error?.message || "Unable to fetch job status";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
