import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function PublicEventNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
      <div className="max-w-lg rounded-[2rem] border border-border/70 bg-background/90 p-8 text-center shadow-sm">
        <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">Event unavailable</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">We could not find that event</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          The event may have been removed or the link may be incorrect.
        </p>
        <Button asChild className="mt-6">
          <Link href="/">Go home</Link>
        </Button>
      </div>
    </main>
  );
}
