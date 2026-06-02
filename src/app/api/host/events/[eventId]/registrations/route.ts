import { NextResponse } from "next/server";

import { auth } from "@/lib/session";
import { getEventRegistrationsForHost } from "@/lib/registrations-admin";

export async function GET(req: Request, { params }: { params: { eventId: string } }) {
  const session = await auth();

  if (!session?.user || session.user.role !== "HOST") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const eventId = params.eventId;

  const url = new URL(req.url);
  const page = Number(url.searchParams.get("page") || "1");
  const limit = Number(url.searchParams.get("limit") || "20");
  const search = url.searchParams.get("search") || undefined;
  const sort = (url.searchParams.get("sort") as any) || undefined;
  const status = url.searchParams.get("status") || undefined;

  try {
    const result = await getEventRegistrationsForHost(eventId, session.user.id, {
      page,
      limit,
      search,
      sort,
      status
    });

    return NextResponse.json(result);
  } catch (error: any) {
    const statusCode = error?.statusCode || 500;
    const message = error?.message || "Unable to load registrations.";
    return NextResponse.json({ error: message }, { status: statusCode });
  }
}
