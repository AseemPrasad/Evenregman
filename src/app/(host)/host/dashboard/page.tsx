import { auth } from "@/lib/session";
import { canAccessHostRoute } from "@/lib/permissions";
import { getHostDashboardData } from "@/lib/dashboard";
import { OverviewCard } from "@/components/dashboard/overview-card";
import { EventTable } from "@/components/dashboard/event-table";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function HostDashboardPage() {
  const session = await auth();

  if (!session?.user || !canAccessHostRoute(session.user.role)) {
    redirect("/signin");
  }

  const { stats, events } = await getHostDashboardData(session.user.id);

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-5 pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
            Host dashboard
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Dashboard overview</h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
            Review event performance, manage status changes, and jump into event-specific actions.
          </p>
        </div>

        <Button asChild size="lg" className="sm:self-start">
          <Link href="/host/events/new">Create event</Link>
        </Button>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <OverviewCard label="Total events" value={stats.totalEvents} description="All events created by your account." />
        <OverviewCard label="Active events" value={stats.activeEvents} description="Events currently open for registrations." />
        <OverviewCard label="Closed events" value={stats.closedEvents} description="Events that are no longer accepting attendees." />
        <OverviewCard label="Total registrations" value={stats.totalRegistrations} description="All active attendee registrations across your events." />
      </section>

      <section className="mt-8 space-y-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Your events</h2>
          <p className="text-sm text-muted-foreground">Use the table to review status, registrations, and actions.</p>
        </div>
        <EventTable data={events} />
      </section>
    </main>
  );
}
