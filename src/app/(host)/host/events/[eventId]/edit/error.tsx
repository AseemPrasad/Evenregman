"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

type ErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function EditEventError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
      <div className="max-w-lg space-y-4 rounded-3xl border border-border/70 bg-card/90 p-8 text-center shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Unable to load this event</h1>
        <p className="text-sm text-muted-foreground">Please try again. If the problem persists, refresh the dashboard and reopen the editor.</p>
        <Button onClick={reset}>Try again</Button>
      </div>
    </main>
  );
}
