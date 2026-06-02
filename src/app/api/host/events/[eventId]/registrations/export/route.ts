import { NextResponse } from "next/server";

import { auth } from "@/lib/session";
import { connectToDatabase } from "@/lib/db";
import { RegistrationModel } from "@/models/Registration";
import { toObjectId, assertEventOwnership } from "@/lib/ownership";

export async function GET(req: Request, { params }: { params: { eventId: string } }) {
  const session = await auth();

  if (!session?.user || session.user.role !== "HOST") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const eventId = params.eventId;

  // query params: mode = 'name_email' or 'email'
  const url = new URL(req.url);
  const mode = (url.searchParams.get("mode") || "name_email").toLowerCase();

  try {
    // verify ownership
    await assertEventOwnership(eventId, session.user.id);

    await connectToDatabase();

    // fetch registrations with attendee info; only active registrations by default
    const regs = await RegistrationModel.find({ eventId: toObjectId(eventId), status: { $in: ["ACTIVE"] } })
      .populate({ path: "attendeeId", select: "name email" })
      .lean();

    // build csv
    let csv = "";
    if (mode === "email" || mode === "email_only") {
      csv += "email\n";
      for (const r of regs) {
        const attendee = (r as any).attendeeId;
        csv += `${(attendee?.email || "").replace(/\"/g, '""')}\n`;
      }
    } else {
      csv += "name,email\n";
      for (const r of regs) {
        const attendee = (r as any).attendeeId;
        const name = (attendee?.name || "").replace(/\"/g, '""');
        const email = (attendee?.email || "").replace(/\"/g, '""');
        csv += `"${name}","${email}"\n`;
      }
    }

    const filename = `registrations-${eventId}-${mode}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`
      }
    });
  } catch (error: any) {
    const statusCode = error?.statusCode || 500;
    const message = error?.message || "Unable to export registrations.";
    return NextResponse.json({ error: message }, { status: statusCode });
  }
}
