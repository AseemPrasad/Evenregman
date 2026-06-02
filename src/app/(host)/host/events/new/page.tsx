import { EventCreateForm } from "@/components/forms/event-create-form";

export default function CreateEventPage() {
  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="space-y-2 pb-8">
        <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
          Event creation
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Create a new event</h1>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
          Set up your event details, define capacity, and publish a unique public slug for attendees.
        </p>
      </div>

      <section className="rounded-3xl border border-border/70 bg-card/90 p-5 shadow-sm backdrop-blur sm:p-8">
        <EventCreateForm />
      </section>
    </main>
  );
}
