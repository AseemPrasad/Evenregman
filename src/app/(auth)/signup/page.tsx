"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { AuthShell } from "@/components/forms/auth-shell";
import { PasswordField } from "@/components/forms/password-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { hostSignupSchema, type HostSignupInput } from "@/schemas/auth";

export default function HostSignupPage() {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<HostSignupInput>({
    resolver: zodResolver(hostSignupSchema),
    defaultValues: {
      name: "",
      email: "",
      password: ""
    },
    mode: "onTouched"
  });

  async function onSubmit(values: HostSignupInput) {
    setSubmitError(null);

    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(values)
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: string; issues?: Record<string, string[]> }
        | null;

      if (!response.ok) {
        const message = payload?.error ?? "Unable to create account";
        setSubmitError(message);
        toast.error(message);
        return;
      }

      toast.success("Host account created. Please sign in.");
      router.push(`/signin?email=${encodeURIComponent(values.email)}`);
    } catch {
      const message = "Something went wrong while creating your account";
      setSubmitError(message);
      toast.error(message);
    }
  }

  const { errors, isSubmitting } = form.formState;

  return (
    <AuthShell
      eyebrow="Host onboarding"
      title="Create your host account"
      description="Start managing events with a secure host workspace built for modern event operations."
      footer={
        <p>
          Already have an account?{" "}
          <Link className="font-medium text-foreground underline-offset-4 hover:underline" href="/signin">
            Sign in
          </Link>
        </p>
      }
    >
      <form className="space-y-5" onSubmit={form.handleSubmit(onSubmit)}>
        {submitError ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {submitError}
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="name">Full name</Label>
          <Input id="name" autoComplete="name" placeholder="Ariana Host" {...form.register("name")} />
          {errors.name ? <p className="text-sm text-destructive">{errors.name.message}</p> : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" autoComplete="email" placeholder="you@company.com" {...form.register("email")} />
          {errors.email ? <p className="text-sm text-destructive">{errors.email.message}</p> : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <PasswordField id="password" autoComplete="new-password" placeholder="Create a secure password" {...form.register("password")} />
          {errors.password ? <p className="text-sm text-destructive">{errors.password.message}</p> : null}
        </div>

        <Button className="w-full" type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {isSubmitting ? "Creating account" : "Create host account"}
        </Button>
      </form>
    </AuthShell>
  );
}import Link from "next/link";

import { SignupForm } from "@/components/auth/signup-form";
import { AuthShell } from "@/components/auth/auth-shell";

export default function HostSignupPage() {
  return (
    <AuthShell
      eyebrow="Host onboarding"
      title="Create your host account"
      description="Set up your organizer profile to create events, manage registrations, and export attendee data."
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
    </AuthShell>
  );
}
