import { redirect, notFound } from "next/navigation";

import { EventEditForm } from "@/components/forms/event-edit-form";
import { auth } from "@/lib/session";
import { canAccessHostRoute } from "@/lib/permissions";
import { connectToDatabase } from "@/lib/db";
import { EventModel } from "@/models/Event";
import { assertEventOwnership, AuthorizationError } from "@/lib/ownership";

type PageProps = {
  params: Promise<{
    eventId: string;
  }>;
};

export default async function EditEventPage({ params }: PageProps) {
  const session = await auth();

  if (!session?.user || !canAccessHostRoute(session.user.role)) {
    redirect("/signin");
  }

  const { eventId } = await params;

  try {
    await assertEventOwnership(eventId, session.user.id);
  } catch (error) {
    if (error instanceof AuthorizationError && error.statusCode === 403) {
      redirect("/unauthorized");
    }

    notFound();
  }

  await connectToDatabase();

  const event = await EventModel.findOne({ _id: eventId, hostId: session.user.id }).lean();

  if (!event) {
    notFound();
  }

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="space-y-2 pb-8">
        <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
          Event management
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Edit event</h1>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
          Update event details, manage lifecycle status, and keep audit timestamps current.
        </p>
      </div>

      <section className="rounded-3xl border border-border/70 bg-card/90 p-5 shadow-sm backdrop-blur sm:p-8">
        <EventEditForm
          eventId={eventId}
          initialStatus={event.status}
          initialValues={{
            title: event.title,
            description: event.description,
            date: event.date.toISOString(),
            time: event.time,
            location: event.location,
            capacity: event.capacity,
            registrationCutoff: event.registrationCutoff.toISOString()
          }}
        />
      </section>
    </main>
  );
}
