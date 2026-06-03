import Link from "next/link";

import { Button } from "@/components/ui/button";

const quickLinks = [
  {
    href: "/signin",
    label: "Sign in",
    description: "Open your attendee or host dashboard with an existing account."
  },
  {
    href: "/signup",
    label: "Host signup",
    description: "Create a host account for event management. Attendees register on public event pages."
  },
  {
    href: "/host/dashboard",
    label: "Host dashboard",
    description: "View events, metrics, and management actions after login."
  },
  {
    href: "/events",
    label: "Public events",
    description: "Browse public events and open an event page to register."
  },
] as const;

export default function HomePage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,rgba(2,132,199,0.10),transparent_35%),linear-gradient(180deg,#f8fafc_0%,#eef2ff_100%)] px-6 py-12 text-slate-950">
      <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(to_right,rgba(15,23,42,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.06)_1px,transparent_1px)] [background-size:72px_72px]" />

      <div className="relative mx-auto flex min-h-[calc(100vh-6rem)] max-w-6xl flex-col justify-center gap-12">
        <section className="max-w-3xl space-y-6">
          <p className="inline-flex rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-slate-600 shadow-sm backdrop-blur">
            Event Registration System
          </p>
          <div className="space-y-4">
            <h1 className="text-5xl font-semibold tracking-tight text-balance sm:text-6xl">
              Create, manage, and register for events in one place.
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-slate-600">
              This app supports host sign-in, event creation, attendee registration, and registration management.
              The database-backed flows live inside the same Next.js app.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/signin">Sign in</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/signup">Create host account</Link>
            </Button>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {quickLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group rounded-3xl border border-slate-200/80 bg-white/80 p-6 shadow-sm backdrop-blur transition hover:-translate-y-1 hover:shadow-lg"
            >
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">{item.label}</p>
              <p className="mt-3 text-base leading-7 text-slate-700">{item.description}</p>
              <p className="mt-5 text-sm font-medium text-sky-700 group-hover:underline">Open route</p>
            </Link>
          ))}
        </section>

        <section className="grid gap-4 rounded-3xl border border-slate-200/80 bg-white/80 p-6 shadow-sm backdrop-blur sm:grid-cols-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Attendee flow</p>
            <p className="mt-2 text-base leading-7 text-slate-700">
              Attendees browse public events at `/events` and open a public event page like `/events/[slug]` to
              register. That registration creates the attendee account automatically.
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Public event pages</p>
            <p className="mt-2 text-base leading-7 text-slate-700">
              Public event pages use `/events/[slug]` for attendee registration.
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Host flow</p>
            <p className="mt-2 text-base leading-7 text-slate-700">
              Hosts can manage events and registrations from `/host/dashboard` after signing in.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
