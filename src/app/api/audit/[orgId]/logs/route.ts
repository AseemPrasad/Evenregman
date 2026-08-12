import "server-only";

import { auth } from "@/lib/session";
import { connectToDatabase } from "@/lib/db";
import { getOrgAuditLogs, countOrgAuditLogs } from "@/lib/audit-logger";
import { getUserMembership } from "@/lib/permissions";
import { toObjectId } from "@/lib/ownership";

type RouteContext = {
  params: Promise<{
    orgId: string;
  }>;
};

export async function GET(req: Request, { params }: RouteContext) {
  const session = await auth();

  if (!session?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  const { orgId } = await params;

  try {
    await connectToDatabase();

    const membership = await getUserMembership(session.user.id, orgId);

    if (!membership) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" }
      });
    }

    const url = new URL(req.url);
    const action = url.searchParams.get("action") || undefined;
    const targetType = url.searchParams.get("targetType") || undefined;
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);
    const skip = parseInt(url.searchParams.get("skip") || "0");

    const logs = await getOrgAuditLogs(toObjectId(orgId), {
      action: action || undefined,
      targetType: targetType || undefined,
      limit,
      skip
    });

    const total = await countOrgAuditLogs(toObjectId(orgId));

    return new Response(
      JSON.stringify({
        logs,
        total,
        limit,
        skip,
        hasMore: skip + limit < total
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );
  } catch (error: any) {
    const message = error?.message || "Failed to fetch audit logs";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
