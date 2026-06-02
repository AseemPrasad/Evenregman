"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { hostSignupSchema, type HostSignupInput } from "@/schemas/auth";

export function SignupForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<HostSignupInput>({
    resolver: zodResolver(hostSignupSchema),
    defaultValues: {
      name: "",
      email: "",
      password: ""
    }
  });

  async function onSubmit(values: HostSignupInput) {
    setFormError(null);

    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values)
      });

      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to create your account");
      }

      const signInResult = await signIn("credentials", {
        email: values.email,
        password: values.password,
        redirect: false
      });

      if (signInResult?.error) {
        throw new Error("Account created, but login failed. Please sign in manually.");
      }

      router.push("/host/dashboard");
      router.refresh();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Something went wrong");
    }
  }

  return (
    <form className="space-y-5" onSubmit={form.handleSubmit(onSubmit)}>
      <div className="space-y-2">
        <Label htmlFor="name">Full name</Label>
        <Input id="name" autoComplete="name" placeholder="Avery Stone" {...form.register("name")} />
        {form.formState.errors.name ? (
          <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="email" placeholder="you@company.com" {...form.register("email")} />
        {form.formState.errors.email ? (
          <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" autoComplete="new-password" placeholder="At least 8 characters" {...form.register("password")} />
        {form.formState.errors.password ? (
          <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>
        ) : null}
      </div>

      {formError ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {formError}
        </div>
      ) : null}

      <Button className="w-full" size="lg" type="submit" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {form.formState.isSubmitting ? "Creating account..." : "Create host account"}
      </Button>
    </form>
  );
}
