export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { connectToDatabase } from "@/lib/db";
import { AuditLogModel } from "@/models/AuditLog";

/**
 * GET /api/mesh/sse/audit
 * Server-Sent Events (SSE) live-stream endpoint for ResMesh audit logs and governance.
 * Streams real-time compute lease checkouts, releases, and access audits.
 */
export async function GET(req: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let isClosed = false;

      const sendEvent = (eventData: unknown) => {
        if (isClosed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(eventData)}\n\n`));
        } catch {
          isClosed = true;
        }
      };

      // 1. Send recent audit events as immediate initial backlog
      try {
        await connectToDatabase();
        const recentLogs = await AuditLogModel.find()
          .sort({ createdAt: -1 })
          .limit(10)
          .lean();

        for (const log of recentLogs.reverse()) {
          sendEvent({
            id: log._id.toString(),
            action: log.action,
            entityType: (log as any).targetType || (log as any).entityType || "RESOURCE",
            entityId: (log as any).targetId?.toString() || (log as any).entityId?.toString() || "",
            actorId: log.actorId?.toString(),
            timestamp: log.createdAt.toISOString(),
            status: "COMMITTED"
          });
        }
      } catch (err) {
        console.error("[Mesh SSE Audit] Error fetching initial backlog:", err);
      }

      // 2. Poll for new events every 3 seconds to push to client
      let lastCheck = new Date();

      const pollInterval = setInterval(async () => {
        if (isClosed) {
          clearInterval(pollInterval);
          return;
        }

        try {
          const newLogs = await AuditLogModel.find({
            createdAt: { $gt: lastCheck }
          })
            .sort({ createdAt: 1 })
            .lean();

          if (newLogs.length > 0) {
            lastCheck = new Date();
            for (const log of newLogs) {
              sendEvent({
                id: log._id.toString(),
                action: log.action,
                entityType: (log as any).targetType || (log as any).entityType || "RESOURCE",
                entityId: (log as any).targetId?.toString() || (log as any).entityId?.toString() || "",
                actorId: log.actorId?.toString(),
                timestamp: log.createdAt.toISOString(),
                status: "COMMITTED"
              });
            }
          } else {
            // Keep-alive heartbeat
            controller.enqueue(encoder.encode(`: heartbeat\n\n`));
          }
        } catch {
          // ignore transient poll error
        }
      }, 3000);

      req.signal.addEventListener("abort", () => {
        isClosed = true;
        clearInterval(pollInterval);
        try {
          controller.close();
        } catch {}
      });
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive"
    }
  });
}

