"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { registerForEventAction, type AttendeeRegistrationState } from "@/app/(public)/events/[slug]/actions";
import { PasswordField } from "@/components/forms/password-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { attendeeRegistrationSchema, type AttendeeRegistrationInput } from "@/schemas/registration";

type EventRegistrationFormProps = {
  slug: string;
  isRegistrationOpen: boolean;
  statusMessage: string;
};

const initialState: AttendeeRegistrationState = { success: false };

export function EventRegistrationForm({ slug, isRegistrationOpen, statusMessage }: EventRegistrationFormProps) {
  const router = useRouter();
  const [actionState, setActionState] = useState<AttendeeRegistrationState>(initialState);

  const form = useForm<AttendeeRegistrationInput>({
    resolver: zodResolver(attendeeRegistrationSchema),
    defaultValues: {
      name: "",
      email: "",
      password: ""
    },
    mode: "onTouched"
  });

  useEffect(() => {
    if (actionState.success) {
      form.reset({ name: "", email: "", password: "" });
      toast.success(actionState.message ?? "Registration completed successfully");
      router.refresh();
    }
  }, [actionState, form, router]);

  async function onSubmit(values: AttendeeRegistrationInput) {
    const response = await registerForEventAction(slug, initialState, values);
    setActionState(response);

    if (!response.success) {
      toast.error(response.message ?? "Unable to complete registration");
    }
  }

  const { errors, isSubmitting } = form.formState;

  return (
    <div className="space-y-4 rounded-3xl border border-border/70 bg-background/70 p-5 shadow-sm backdrop-blur">
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">Register</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{statusMessage}</p>
      </div>

      {isRegistrationOpen ? (
        <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
          {actionState.message && !actionState.success ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {actionState.message}
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" autoComplete="name" placeholder="Jordan Lee" {...form.register("name")} />
            {errors.name ? <p className="text-sm text-destructive">{errors.name.message}</p> : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" placeholder="you@example.com" {...form.register("email")} />
            {errors.email ? <p className="text-sm text-destructive">{errors.email.message}</p> : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <PasswordField id="password" autoComplete="new-password" placeholder="Create a password" {...form.register("password")} />
            {errors.password ? <p className="text-sm text-destructive">{errors.password.message}</p> : null}
          </div>

          <Button className="w-full" type="submit" disabled={isSubmitting} size="lg">
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isSubmitting ? "Registering" : "Register now"}
          </Button>

          <p className="text-xs leading-5 text-muted-foreground">
            If your email already exists, we will verify your password and reuse your attendee account.
          </p>
        </form>
      ) : (
        <div className="rounded-2xl border border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
          Registration is currently unavailable for this event.
        </div>
      )}
    </div>
  );
}
