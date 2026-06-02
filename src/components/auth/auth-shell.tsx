import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type AuthShellProps = {
  title: string;
  description: string;
  eyebrow: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
};

export function AuthShell({ title, description, eyebrow, children, footer, className }: AuthShellProps) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.88),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(148,163,184,0.18),_transparent_28%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] px-4 py-8 dark:bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.04),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(148,163,184,0.14),_transparent_28%),linear-gradient(180deg,_#020617_0%,_#0f172a_100%)] sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-7xl items-center">
        <div className="grid w-full gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10">
          <section className="hidden flex-col justify-between rounded-[2rem] border border-border/60 bg-card/70 p-8 shadow-[0_24px_80px_-35px_rgba(15,23,42,0.35)] backdrop-blur md:flex lg:p-10">
            <div className="space-y-6">
              <p className="inline-flex rounded-full border border-border/70 bg-background/80 px-3 py-1 text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
                {eyebrow}
              </p>
              <div className="max-w-xl space-y-4">
                <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
                  Manage events with the clarity of a modern SaaS product.
                </h1>
                <p className="max-w-lg text-base leading-7 text-muted-foreground">
                  Create a polished host experience for secure access, fast onboarding, and a responsive workflow built for production.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ["Role-based", "Host and attendee flows stay isolated."],
                ["Secure", "Credentials auth with hashed passwords."],
                ["Responsive", "Designed mobile-first and desktop-ready."]
              ].map(([heading, body]) => (
                <div key={heading} className="rounded-2xl border border-border/70 bg-background/70 p-4">
                  <div className="text-sm font-semibold">{heading}</div>
                  <div className="mt-1 text-sm leading-6 text-muted-foreground">{body}</div>
                </div>
              ))}
            </div>
          </section>

          <section className={cn("flex items-center justify-center", className)}>
            <Card className="w-full max-w-xl border-border/70 bg-card/95">
              <CardHeader className="space-y-3">
                <CardTitle>{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
              </CardHeader>
              <CardContent>{children}</CardContent>
              {footer ? <div className="px-6 pb-6 pt-0">{footer}</div> : null}
            </Card>
          </section>
        </div>
      </div>
    </main>
  );
}

export function AuthFooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Button variant="link" className="h-auto p-0 text-sm font-medium" asChild={false}>
      <Link href={href}>{children}</Link>
    </Button>
  );
}
