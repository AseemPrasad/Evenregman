import "server-only";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { EventModel } from "@/models/Event";
import { auth } from "@/lib/auth";
import { createEnterpriseResource } from "@/lib/mesh/lease-service";

/**
 * GET /api/mesh/resources
 * List all available compute and environment resources.
 */
export async function GET() {
  try {
    await connectToDatabase();

    const resources = await EventModel.find({
      kind: "RESOURCE",
      status: { $ne: "DELETED" }
    })
      .select({
        _id: 1,
        title: 1,
        slug: 1,
        description: 1,
        resourceType: 1,
        capacity: 1,
        attendeeCount: 1,
        hourlyCostRate: 1,
        defaultLeaseMinutes: 1,
        status: 1,
        location: 1
      })
      .lean();

    return NextResponse.json({ resources });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * POST /api/mesh/resources
 * Register a new compute or environment resource (Admin/Host role required).
 */
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const resource = await createEnterpriseResource(session.user.id, body);

    return NextResponse.json({ success: true, resource }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

