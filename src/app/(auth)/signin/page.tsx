"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { signIn } from "next-auth/react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { AuthShell } from "@/components/forms/auth-shell";
import { PasswordField } from "@/components/forms/password-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginSchema, type LoginInput } from "@/schemas/auth";

export default function HostLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const defaultEmail = useMemo(() => searchParams.get("email") ?? "", [searchParams]);

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: defaultEmail,
      password: ""
    },
    mode: "onTouched"
  });

  useEffect(() => {
    if (defaultEmail) {
      form.setValue("email", defaultEmail, { shouldValidate: true });
    }
  }, [defaultEmail, form]);

  async function onSubmit(values: LoginInput) {
    setSubmitError(null);

    const result = await signIn("credentials", {
      email: values.email,
      password: values.password,
      redirect: false
    });

    if (result?.error) {
      const message = "Invalid email or password";
      setSubmitError(message);
      toast.error(message);
      return;
    }

    toast.success("Signed in successfully");
    router.push("/host/dashboard");
    router.refresh();
  }

  const { errors, isSubmitting } = form.formState;

  return (
    <AuthShell
      eyebrow="Host access"
      title="Sign in to your host dashboard"
      description="Manage events, track registrations, and export attendee data from one secure workspace."
      footer={
        <p>
          New here?{" "}
          <Link className="font-medium text-foreground underline-offset-4 hover:underline" href="/signup">
            Create a host account
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
          <Label htmlFor="email">Email</Label>
          <Input id="email" autoComplete="email" placeholder="you@company.com" {...form.register("email")} />
          {errors.email ? <p className="text-sm text-destructive">{errors.email.message}</p> : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <PasswordField id="password" autoComplete="current-password" placeholder="Enter your password" {...form.register("password")} />
          {errors.password ? <p className="text-sm text-destructive">{errors.password.message}</p> : null}
        </div>

        <Button className="w-full" type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {isSubmitting ? "Signing in" : "Sign in"}
        </Button>
      </form>
    </AuthShell>
  );
}import Link from "next/link";

import { LoginForm } from "@/components/auth/login-form";
import { AuthShell } from "@/components/auth/auth-shell";

export default function SignInPage() {
  return (
    <AuthShell
      eyebrow="Secure access"
      title="Sign in to your host dashboard"
      description="Use your credentials to access your events, registrations, and management tools."
      footer={
        <p className="text-sm text-muted-foreground">
          New here?{" "}
          <Link href="/signup" className="font-medium text-foreground underline underline-offset-4">
            Create a host account
          </Link>
        </p>
      }
    >
      <LoginForm />
    </AuthShell>
  );
}
