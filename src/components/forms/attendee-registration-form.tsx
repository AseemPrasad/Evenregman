"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { registerForEventAction, type AttendeeRegistrationFormValues, type AttendeeRegistrationState } from "@/app/(public)/events/[slug]/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordField } from "@/components/forms/password-field";
import { attendeeRegistrationSchema } from "@/schemas/registration";

type AttendeeRegistrationFormProps = {
  eventSlug: string;
};

const initialState: AttendeeRegistrationState = { success: false };

export function AttendeeRegistrationForm({ eventSlug }: AttendeeRegistrationFormProps) {
  const router = useRouter();
  const [actionState, setActionState] = useState<AttendeeRegistrationState>(initialState);

  const form = useForm<AttendeeRegistrationFormValues>({
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
      toast.success(actionState.message ?? "Registration complete");
      router.refresh();
    }
  }, [actionState, form, router]);

  async function onSubmit(values: AttendeeRegistrationFormValues) {
    const response = await registerForEventAction(eventSlug, initialState, values);
    setActionState(response);

    if (!response.success) {
      toast.error(response.message ?? "Unable to register for the event");
    }
  }

  const { errors, isSubmitting } = form.formState;

  return (
    <form className="space-y-5" onSubmit={form.handleSubmit(onSubmit)}>
      {actionState.message && !actionState.success ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {actionState.message}
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" autoComplete="name" placeholder="Alex Morgan" {...form.register("name")} />
        {errors.name ? <p className="text-sm text-destructive">{errors.name.message}</p> : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="email" placeholder="alex@company.com" {...form.register("email")} />
        {errors.email ? <p className="text-sm text-destructive">{errors.email.message}</p> : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <PasswordField id="password" autoComplete="new-password" placeholder="Your attendee password" {...form.register("password")} />
        {errors.password ? <p className="text-sm text-destructive">{errors.password.message}</p> : null}
      </div>

      <Button className="w-full" size="lg" type="submit" disabled={isSubmitting}>
        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {isSubmitting ? "Registering" : "Register for this event"}
      </Button>

      <p className="text-xs leading-5 text-muted-foreground">
        If your email already exists, we will verify your password and reuse your attendee account.
      </p>
    </form>
  );
}
