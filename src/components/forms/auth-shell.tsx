import type { ReactNode } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type AuthShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function AuthShell({ eyebrow, title, description, footer, children, className }: AuthShellProps) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(15,23,42,0.08),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(2,132,199,0.14),transparent_30%)]">
      <div className="pointer-events-none absolute inset-0 opacity-60 [background-image:linear-gradient(to_right,rgba(148,163,184,0.16)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.16)_1px,transparent_1px)] [background-size:56px_56px]" />

      <div className="relative mx-auto grid min-h-screen max-w-7xl lg:grid-cols-[1.05fr_0.95fr]">
        <section className="flex items-center px-6 py-12 sm:px-10 lg:px-14">
          <div className="max-w-xl space-y-8">
            <div className="inline-flex items-center rounded-full border border-border bg-background/70 px-4 py-2 text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground shadow-sm backdrop-blur">
              {eyebrow}
            </div>

            <div className="space-y-4">
              <h1 className="text-4xl font-semibold tracking-tight text-balance text-foreground sm:text-5xl lg:text-6xl">
                {title}
              </h1>
              <p className="max-w-lg text-base leading-7 text-muted-foreground sm:text-lg">
                {description}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {[
                ["Secure onboarding", "Credentials auth with bcryptjs and role-aware sessions."],
                ["Responsive by default", "A clean mobile-first layout built for hosts on the move."],
                ["Fast workflows", "Validated forms with real loading and error feedback."],
                ["Production ready", "Designed to scale cleanly across the event lifecycle."]
              ].map(([heading, body]) => (
                <div
                  key={heading}
                  className="rounded-2xl border border-border/70 bg-background/70 p-4 shadow-sm backdrop-blur"
                >
                  <p className="text-sm font-medium text-foreground">{heading}</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center px-6 pb-12 sm:px-10 lg:px-14 lg:py-12">
          <Card className={cn("w-full max-w-md border-border/70 bg-background/90 backdrop-blur-xl", className)}>
            <CardHeader className="space-y-2">
              <CardTitle>{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent>{children}</CardContent>
            {footer ? <div className="px-6 pb-6 text-sm text-muted-foreground">{footer}</div> : null}
          </Card>
        </section>
      </div>
    </div>
  );
}