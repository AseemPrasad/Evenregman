"use client";

import { useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";

import { cancelRegistrationAction } from "@/app/(attendee)/attendee/dashboard/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import EmptyState from "@/components/ui/empty-state";
import type { AttendeeRegistrationRow } from "@/lib/attendee-dashboard";

type Props = {
  registrations: AttendeeRegistrationRow[];
};

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(value);
}

function CancelButton({ registrationId }: { registrationId: string }) {
  const [isPending, startTransition] = useTransition();

  function handleCancel() {
    startTransition(async () => {
      const result = await cancelRegistrationAction(registrationId);

      if (result.success) {
        toast.success(result.message);
        window.location.reload();
        return;
      }

      toast.error(result.message);
    });
  }

  return (
    <Button variant="outline" size="sm" disabled={isPending} onClick={handleCancel}>
      {isPending ? "Cancelling..." : "Cancel registration"}
    </Button>
  );
}

export function AttendeeRegistrationTable({ registrations }: Props) {
  return (
    <Card className="border-border/70 bg-card/90">
      <CardContent className="overflow-x-auto p-0">
        <table className="premium-table">
          <thead>
            <tr>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Event</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Registered</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {registrations.length ? (
              registrations.map((registration) => (
                <tr key={registration.id} className="border-b border-border/50 last:border-0">
                  <td className="px-4 py-4 align-top">
                    <div className="space-y-1">
                      <div className="font-medium">{registration.event.title}</div>
                      <div className="text-sm text-muted-foreground">
                        {registration.event.location} · {formatDate(registration.event.date)} · {registration.event.time}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        <Link className="underline-offset-4 hover:underline" href={`/events/${registration.event.slug}`}>
                          View public page
                        </Link>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 align-top text-sm text-muted-foreground">
                    {formatDate(registration.registeredAt)}
                  </td>
                  <td className="px-4 py-4 align-top">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                        registration.status === "ACTIVE"
                          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                          : "bg-zinc-500/10 text-zinc-700 dark:text-zinc-300"
                      }`}
                    >
                      {registration.status}
                    </span>
                    {registration.cancelledAt ? (
                      <div className="mt-2 text-xs text-muted-foreground">
                        Cancelled {formatDate(registration.cancelledAt)}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-4 align-top">
                    {registration.status === "ACTIVE" ? (
                      <CancelButton registrationId={registration.id} />
                    ) : (
                      <span className="text-sm text-muted-foreground">No actions available</span>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-6 py-8" colSpan={4}>
                  <EmptyState
                    title="No registrations yet"
                    description="Register for an event first to see it here."
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
