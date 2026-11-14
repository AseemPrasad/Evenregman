import "server-only";

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { acquireResourceLease, releaseResourceLease, extendResourceLease } from "@/lib/mesh/lease-service";

/**
 * POST /api/mesh/leases
 * Acquire a lease on a scarce compute/environment resource.
 * Request body: { resourceSlug: string, durationMinutes?: number }
 */
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { resourceSlug, durationMinutes } = body;

    if (!resourceSlug) {
      return NextResponse.json({ error: "resourceSlug is required" }, { status: 400 });
    }

    const result = await acquireResourceLease(resourceSlug, session.user.id, durationMinutes);

    if (!result.success) {
      return NextResponse.json({ error: result.message }, { status: 409 });
    }

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * PATCH /api/mesh/leases
 * Action on an existing lease (release or extend).
 * Request body: { leaseId: string, action: "release" | "extend", additionalMinutes?: number }
 */
export async function PATCH(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { leaseId, action, additionalMinutes } = body;

    if (!leaseId || !action) {
      return NextResponse.json({ error: "leaseId and action are required" }, { status: 400 });
    }

    if (action === "release") {
      const result = await releaseResourceLease(leaseId, session.user.id);
      return NextResponse.json(result);
    }

    if (action === "extend") {
      const result = await extendResourceLease(leaseId, session.user.id, additionalMinutes ?? 60);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

