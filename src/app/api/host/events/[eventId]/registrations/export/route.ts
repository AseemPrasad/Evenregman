import { auth } from "@/lib/session";
import { connectToDatabase } from "@/lib/db";
import { RegistrationModel } from "@/models/Registration";
import { toObjectId, assertEventOwnership } from "@/lib/ownership";

export async function GET(req: Request, { params }: { params: { eventId: string } }) {
  const session = await auth();

  if (!session?.user || session.user.role !== "HOST") {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  const eventId = params.eventId;

  const url = new URL(req.url);
  const mode = (url.searchParams.get("mode") || "name_email").toLowerCase();
  const search = url.searchParams.get("search");

  try {
    // verify ownership
    await assertEventOwnership(eventId, session.user.id);

    await connectToDatabase();

    // build aggregation pipeline to stream joined attendee info
    const match: any = { eventId: toObjectId(eventId), status: { $in: ["ACTIVE"] } };

    const pipeline: any[] = [
      { $match: match },
      { $lookup: { from: "users", localField: "attendeeId", foreignField: "_id", as: "attendee" } },
      { $unwind: "$attendee" }
    ];

    if (search) {
      const regex = new RegExp(search.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&"), "i");
      pipeline.push({ $match: { $or: [{ "attendee.name": { $regex: regex } }, { "attendee.email": { $regex: regex } }] } });
    }

    pipeline.push({ $project: { "attendee.name": 1, "attendee.email": 1 } });

    const cursor = RegistrationModel.aggregate(pipeline).cursor({ batchSize: 1000 }).exec();

    const filename = `registrations-${eventId}-${mode}.csv`;

    const stream = new ReadableStream({
      async start(controller) {
        // emit header
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
  } catch (error: any) {
    const statusCode = error?.statusCode || 500;
    const message = error?.message || "Unable to export registrations.";
    return new Response(JSON.stringify({ error: message }), { status: statusCode, headers: { "Content-Type": "application/json" } });
  }
}
