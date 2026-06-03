import Link from "next/link";
import { redirect } from "next/navigation";

import { AttendeeRegistrationTable } from "@/components/attendee/registration-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { auth } from "@/lib/session";
import { canAccessAttendeeRoute } from "@/lib/permissions";
import { getAttendeeDashboardData } from "@/lib/attendee-dashboard";

export default async function AttendeeDashboardPage() {
  const session = await auth();

  if (!session?.user || !canAccessAttendeeRoute(session.user.role)) {
    redirect("/signin");
  }

  const { stats, registrations } = await getAttendeeDashboardData(session.user.id);

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-5 pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
            Attendee dashboard
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">My registrations</h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
            Review your event registrations and cancel any active seat when needed.
          </p>
        </div>

        <Button asChild size="lg">
          <Link href="/">Browse events</Link>
        </Button>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <Card className="border-border/70 bg-card/90">
          <CardContent className="p-5">
            <p className="text-sm font-medium text-muted-foreground">Total registrations</p>
            <div className="mt-2 text-3xl font-semibold tracking-tight">{stats.totalRegistrations}</div>
          </CardContent>
        </Card>
        <Card className="border-border/70 bg-card/90">
          <CardContent className="p-5">
            <p className="text-sm font-medium text-muted-foreground">Active</p>
            <div className="mt-2 text-3xl font-semibold tracking-tight">{stats.activeRegistrations}</div>
          </CardContent>
        </Card>
        <Card className="border-border/70 bg-card/90">
          <CardContent className="p-5">
            <p className="text-sm font-medium text-muted-foreground">Cancelled</p>
            <div className="mt-2 text-3xl font-semibold tracking-tight">{stats.cancelledRegistrations}</div>
          </CardContent>
        </Card>
      </section>

      <section className="mt-8 space-y-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Registration history</h2>
          <p className="text-sm text-muted-foreground">Cancel active registrations and revisit the event page anytime.</p>
        </div>

        <AttendeeRegistrationTable registrations={registrations} />
      </section>
    </main>
  );
}
