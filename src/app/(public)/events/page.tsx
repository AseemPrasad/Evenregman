import Link from "next/link";

import { getPublicEvents, formatPublicEventDate } from "@/lib/public-events";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import EmptyState from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

function StatusPill({ status }: { status: "OPEN" | "FULL" | "CLOSED" | "DELETED" }) {
  const tone =
    status === "OPEN"
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : status === "FULL"
        ? "bg-sky-500/10 text-sky-700 dark:text-sky-300"
        : "bg-amber-500/10 text-amber-700 dark:text-amber-300";

  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${tone}`}>{status}</span>;
}

export default async function PublicEventsPage() {
  const events = await getPublicEvents();

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(15,23,42,0.08),transparent_25%),radial-gradient(circle_at_bottom_right,rgba(2,132,199,0.10),transparent_30%)] px-4 py-10 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 opacity-50 [background-image:linear-gradient(to_right,rgba(148,163,184,0.14)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.14)_1px,transparent_1px)] [background-size:56px_56px]" />

      <div className="relative mx-auto max-w-6xl">
        <section className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">Public events</p>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Browse available events</h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              Choose an event to view details and register as an attendee.
            </p>
          </div>

          <Button asChild variant="outline">
            <Link href="/">Back to home</Link>
          </Button>
        </section>

        {events.length ? (
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {events.map((event) => {
              const remainingSeats = Math.max(event.capacity - event.attendeeCount, 0);
              const isSoldOut = remainingSeats === 0;

              return (
                <Card key={event.slug} className="border-border/70 bg-background/90 shadow-sm backdrop-blur">
                  <CardContent className="space-y-4 p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-2">
                        <StatusPill status={event.status} />
                        <h2 className="text-xl font-semibold tracking-tight">{event.title}</h2>
                      </div>
                    </div>

                    <p className="text-sm leading-6 text-muted-foreground">{event.location}</p>

                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-2xl border border-border/70 bg-muted/20 p-3">
                        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Date</div>
                        <div className="mt-1 font-medium">{formatPublicEventDate(event.date)}</div>
                      </div>
                      <div className="rounded-2xl border border-border/70 bg-muted/20 p-3">
                        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Time</div>
                        <div className="mt-1 font-medium">{event.time}</div>
                      </div>
                      <div className="rounded-2xl border border-border/70 bg-muted/20 p-3">
                        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Seats left</div>
                        <div className="mt-1 font-medium">{remainingSeats}</div>
                      </div>
                      <div className="rounded-2xl border border-border/70 bg-muted/20 p-3">
                        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Capacity</div>
                        <div className="mt-1 font-medium">{event.capacity}</div>
                      </div>
                    </div>

                    {event.status === "CLOSED" || isSoldOut ? (
                      <Button className="w-full" disabled variant="outline">
                        {event.status === "CLOSED" ? "Closed" : "Sold out"}
                      </Button>
                    ) : (
                      <Button asChild className="w-full" variant="outline">
                        <Link href={`/events/${event.slug}`}>View event</Link>
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </section>
        ) : (
          <Card className="border-border/70 bg-background/90">
            <CardContent className="p-0">
              <EmptyState
                title="No public events yet"
                description="When a host creates an event, it will appear here for attendees."
              />
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
