import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  buildPublicEventMetadata,
  formatPublicEventDate,
  getPublicEventBySlug
} from "@/lib/public-events";
import { EventRegistrationForm } from "@/components/registrations/event-registration-form";

type PageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const event = await getPublicEventBySlug(slug);

  if (!event) {
    return {
      title: "Event not found",
      description: "The requested event could not be found."
    };
  }

  const metadata = buildPublicEventMetadata(event);

  return {
    title: metadata.title,
    description: metadata.description,
    openGraph: metadata.openGraph,
    twitter: metadata.twitter,
    alternates: {
      canonical: `/events/${event.slug}`
    }
  };
}

export default async function PublicEventPage({ params }: PageProps) {
  const { slug } = await params;
  const event = await getPublicEventBySlug(slug);

  if (!event) {
    notFound();
  }

  const remainingSeats = Math.max(event.capacity - event.attendeeCount, 0);
  const isSoldOut = remainingSeats === 0;
  const registrationCutoffPassed = event.registrationCutoff.getTime() <= Date.now();
  const canRegister = event.status === "OPEN" && !isSoldOut && !registrationCutoffPassed;
  const statusMessage = canRegister
    ? "Complete the form below to create or reuse your attendee account and secure your seat."
    : registrationCutoffPassed
      ? "Registration cutoff has passed for this event."
      : isSoldOut
        ? "This event has reached capacity."
        : event.status === "CLOSED"
          ? "This event is closed for new registrations."
          : "Registration is currently unavailable.";

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(15,23,42,0.08),transparent_25%),radial-gradient(circle_at_bottom_right,rgba(2,132,199,0.10),transparent_30%)] px-4 py-10 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 opacity-50 [background-image:linear-gradient(to_right,rgba(148,163,184,0.14)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.14)_1px,transparent_1px)] [background-size:56px_56px]" />

      <div className="relative mx-auto max-w-6xl">
        <section className="rounded-[2rem] border border-border/70 bg-background/90 p-6 shadow-[0_24px_80px_-30px_rgba(15,23,42,0.25)] backdrop-blur sm:p-8 lg:p-10">
          <div className="flex flex-wrap items-center gap-3 text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
            <span>Public event</span>
            <span className="h-1 w-1 rounded-full bg-muted-foreground/50" />
            <span>{event.status}</span>
          </div>

          <div className="mt-6 grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
            <div className="space-y-6">
              <div className="space-y-4">
                <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
                  {event.title}
                </h1>
                <p className="max-w-3xl text-base leading-8 text-muted-foreground sm:text-lg">
                  {event.description}
                </p>
              </div>

              <dl className="grid gap-4 sm:grid-cols-2">
                {[
                  ["Date", formatPublicEventDate(event.date)],
                  ["Time", event.time],
                  ["Location", event.location],
                  ["Attendees", `${event.attendeeCount}`],
                  ["Remaining seats", `${remainingSeats}`],
                  ["Capacity", `${event.capacity}`]
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                    <dt className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">{label}</dt>
                    <dd className="mt-2 text-base font-medium text-foreground">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <aside className="rounded-3xl border border-border/70 bg-muted/20 p-6">
              <div className="space-y-3">
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">
                  Registration status
                </p>
                <div className="text-3xl font-semibold tracking-tight">
                  {isSoldOut ? "Sold out" : `${remainingSeats} seats left`}
                </div>
                <p className="text-sm leading-6 text-muted-foreground">
                  {isSoldOut
                    ? "This event has reached capacity."
                    : "Seats are available. Registration remains open until the cutoff date."}
                </p>
              </div>

              <div className="mt-6 grid gap-3 text-sm">
                <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                  <div className="font-medium">Slug</div>
                  <div className="mt-1 break-all text-muted-foreground">/{event.slug}</div>
                </div>
                <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                  <div className="font-medium">Registration cutoff</div>
                  <div className="mt-1 text-muted-foreground">{formatPublicEventDate(event.registrationCutoff)}</div>
                </div>
              </div>

              <div className="mt-6 rounded-3xl border border-border/70 bg-background/70 p-5">
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">
                  Registration
                </p>

                <div className="mt-4">
                  <EventRegistrationForm
                    slug={event.slug}
                    isRegistrationOpen={canRegister}
                    statusMessage={statusMessage}
                  />
                </div>
              </div>
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}
