"use client";

import Link from "next/link";

import { SignupForm } from "@/components/auth/signup-form";
import { AuthShell } from "@/components/auth/auth-shell";

export default function SignUpPage() {
  return (
    <AuthShell
      eyebrow="Host onboarding"
      title="Create your host account"
      description="Host-only onboarding. Attendees register through public event pages, not this form."
      footer={
        <p className="text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/signin" className="font-medium text-foreground underline underline-offset-4">
            Sign in
          </Link>
        </p>
      }
    >
      <SignupForm />
      <p className="mt-4 text-xs leading-5 text-muted-foreground">
        Attendees do not create accounts on this page. Their account is created automatically when they register
        for a public event at <span className="font-medium text-foreground">/events/[slug]</span>.
      </p>
    </AuthShell>
  );
}
